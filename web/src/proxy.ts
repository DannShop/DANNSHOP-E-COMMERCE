import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { isAuthorizedCron } from "@/lib/jobs/cron-auth";
import { isMaintenanceModeOn } from "@/lib/site-settings";
import {
  canAccessAdminPath,
  canEnterAdmin,
  firstAllowedAdminPath,
  type UserRole,
} from "@/lib/rbac/access";
import { parsePermissions } from "@/lib/rbac/permissions";

const { auth } = NextAuth(authConfig);

const RATE_LIMITS: { match: (pathname: string) => boolean; method?: string; key: string; limit: number; windowMs: number }[] = [
  // method: "POST" - Next.js prefetch dari <Link href="/login">/<Link href="/register"> di header
  // global mengirim GET diam-diam di production; tanpa filter method itu makan budget rate-limit
  // yang seharusnya untuk submit form asli (paling parah /register yang cuma 3/menit).
  { match: (p) => p === "/login", method: "POST", key: "login", limit: 5, windowMs: 60_000 },
  { match: (p) => p === "/register", method: "POST", key: "register", limit: 3, windowMs: 60_000 },
  { match: (p) => p === "/api/webhooks/midtrans", key: "webhook", limit: 60, windowMs: 60_000 },
  { match: (p) => p === "/api/webhooks/digiflazz", key: "webhook-digiflazz", limit: 60, windowMs: 60_000 },
  { match: (p) => p === "/api/cron/tick", key: "cron-tick", limit: 10, windowMs: 60_000 },
  // limit 120 (bukan 30) - halaman invoice polling tiap 3000ms (~20 req/menit per tab), dua tab/dua
  // customer di NAT yang sama sebelumnya cukup untuk trip limit 30/menit dan merusak layar tunggu bayar.
  { match: (p) => /^\/api\/orders\/[^/]+\/status$/.test(p), key: "order-status", limit: 120, windowMs: 60_000 },
  // API partner (H2H). Ini LANTAI anti-DoS berbasis IP, bukan kuota partner yang
  // sesungguhnya - kuota per-partner ada di authenticatePartner() dan di-key ke
  // username, supaya satu partner yang mengamuk tidak mematikan partner lain yang
  // kebetulan sekantor/se-NAT. Batas di sini sengaja longgar: yang harus dihentikan
  // di lapisan ini cuma banjir dari satu sumber, dan menahan request SEBELUM
  // menyentuh DB adalah satu-satunya hal yang bisa dilakukan sebelum kita tahu
  // pemanggilnya siapa.
  { match: (p) => p.startsWith("/api/v1/"), key: "partner-api", limit: 300, windowMs: 60_000 },
];

export default auth(async (req) => {
  const { nextUrl } = req;
  const user = req.auth?.user;
  const ip = extractIp(req.headers);

  const rule = RATE_LIMITS.find((r) => r.match(nextUrl.pathname) && (!r.method || r.method === req.method));
  if (rule) {
    // Caller cron-tick yang sudah membawa x-cron-secret valid (divalidasi lagi oleh route itu
    // sendiri) tidak butuh limit berbasis IP tambahan - IP dari X-Forwarded-For bisa dispoof
    // caller, jadi limit IP di sini sebenarnya cuma lubang DoS (starve bucket IP bersama) untuk
    // endpoint yang sudah punya autentikasi sendiri via secret.
    // isAuthorizedCron (bukan cek `x-cron-secret` manual) supaya lapisan ini
    // mengenali skema header yang SAMA dengan route handler-nya. Vercel Cron
    // mengirim `Authorization: Bearer <CRON_SECRET>`, bukan `x-cron-secret`;
    // dengan cek manual yang lama, cron Vercel yang sah tidak dianggap tepercaya
    // dan ikut masuk hitungan rate limit per-IP bersama.
    const isTrustedCron = rule.key === "cron-tick" && isAuthorizedCron(req.headers);
    if (!isTrustedCron) {
      const result = await checkRateLimit(`${rule.key}:ip:${ip}`, rule.limit, rule.windowMs);
      if (!result.allowed) {
        return NextResponse.json(
          { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." },
          {
            status: 429,
            headers: result.retryAfterMs ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } : undefined,
          },
        );
      }
    }
  }

  // Manifest aplikasi mobile admin. HARUS dilewatkan tanpa autentikasi, dan ini
  // bukan kelonggaran melainkan syarat teknis: browser mengambil manifest dengan
  // `credentials: "omit"` — cookie sesi TIDAK ikut terkirim, seberapa pun
  // sahnya admin yang sedang membuka halamannya. Kalau ikut digerbang, yang
  // diterima browser adalah pengalihan ke /login, dan app admin tidak akan
  // pernah bisa dipasang ke layar utama.
  //
  // Yang terbuka cuma nama app, warna, dan URL ikon — tidak ada data, tidak ada
  // jalan masuk. Halaman-halaman di baliknya tetap digerbang seperti biasa.
  const isAdminManifest = nextUrl.pathname === "/admin/app.webmanifest";

  if (nextUrl.pathname.startsWith("/admin") && !isAdminManifest) {
    if (!user || !canEnterAdmin(user.role)) {
      return Response.redirect(new URL("/login", nextUrl));
    }
    const fresh = await db.user.findUnique({
      where: { id: user.id },
      select: {
        role: true,
        updatedAt: true,
        // Izin ikut dibaca di sini, BUKAN diambil dari JWT. Token di sini
        // stateless dan berumur panjang, jadi izin yang disimpan di dalamnya
        // akan tetap berlaku setelah dicabut sampai tokennya kedaluwarsa -
        // pencabutan hak harus berlaku pada request berikutnya, bukan 12 jam
        // lagi. Query ini memang sudah ada sebelumnya untuk penegakan ban;
        // yang ditambahkan cuma kolomnya, bukan query baru.
        staffRole: { select: { permissions: true, isActive: true } },
      },
    });
    if (!fresh || !canEnterAdmin(fresh.role) || fresh.updatedAt.getTime() !== user.updatedAt) {
      return Response.redirect(new URL("/login", nextUrl));
    }

    // INILAH penegakan izin per halaman. Ada di middleware, bukan di layout,
    // karena layout Next.js TIDAK dijalankan ulang saat berpindah halaman dari
    // dalam aplikasi - gerbang berbasis route di layout menyala tidak konsisten
    // dan sudah pernah mengunci admin di produksi. Middleware selalu tahu
    // pathname dan selalu jalan.
    const viewer = {
      role: fresh.role as UserRole,
      permissions:
        fresh.staffRole && fresh.staffRole.isActive ? parsePermissions(fresh.staffRole.permissions) : [],
    };
    if (!canAccessAdminPath(viewer, nextUrl.pathname)) {
      // Diantar ke halaman pertama yang boleh dia buka, bukan ditolak
      // mentah-mentah. Tujuan yang paling sering ditolak adalah `/admin` itu
      // sendiri - halaman yang otomatis dituju setiap kali karyawan login.
      const target = firstAllowedAdminPath(viewer);
      // Penjaga anti-putar: kalau tujuannya sama dengan yang barusan ditolak,
      // mengalihkan ke sana akan mengulang keputusan yang sama selamanya.
      if (target === nextUrl.pathname) {
        return new Response("Tidak diizinkan", { status: 403 });
      }
      return Response.redirect(new URL(target, nextUrl));
    }
  }

  if (nextUrl.pathname.startsWith("/account")) {
    if (!user) {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }

  // Portal mitra: di lapisan ini cukup "sudah login". Apakah user ini benar-benar
  // punya akun partner diperiksa di app/mitra/layout.tsx, yang bisa membedakan
  // "bukan mitra" (diantar ke formulir pengajuan) dari "mitra nonaktif" (tetap
  // boleh membaca portalnya). Middleware tidak punya konteks untuk membedakan
  // keduanya tanpa query DB kedua, dan jawabannya bukan sekadar tolak/terima.
  if (nextUrl.pathname.startsWith("/mitra")) {
    if (!user) {
      return Response.redirect(new URL("/login", nextUrl));
    }
  }

  // Maintenance mode: tutup storefront publik, tapi /admin tetap harus bisa
  // diakses (buat matiin lagi) dan /login tetap harus bisa diakses (kalau
  // sesi admin kadaluwarsa persis pas maintenance nyala, jangan sampai
  // admin ikut terkunci keluar). Rewrite (bukan redirect) supaya URL asli
  // di address bar tidak berubah begitu maintenance dimatikan lagi.
  // /mitra ikut dikecualikan: mode maintenance menutup TOKO, sementara
  // /api/v1/* (yang juga dikecualikan lewat /api) tetap melayani mitra. Menutup
  // portalnya sementara API-nya jalan berarti mitra kehilangan satu-satunya
  // tempat melihat saldo dan log callback justru saat transaksinya tetap
  // berjalan — tidak koheren.
  //
  // Aset aplikasi mobile (PWA) ikut dikecualikan, dan ini BUKAN kerapian —
  // tanpanya, menyalakan mode maintenance merusak app yang sudah terpasang di
  // HP orang. Rewrite membalas HTTP 200 berisi HTML halaman maintenance, jadi:
  //   - /manifest.webmanifest -> browser membaca HTML sebagai manifest, dan app
  //     yang terpasang kehilangan nama serta ikonnya secara permanen sampai
  //     dipasang ulang;
  //   - /sw.js -> pendaftaran service worker gagal (tipe MIME salah);
  //   - /icons/* -> ikon berubah jadi kotak kosong;
  //   - /pwa/splash -> iOS menerima HTML sebagai gambar, dan layar pembuka app
  //     terpasang kembali kosong putih.
  // Yang bocor dari pengecualian ini cuma nama toko dan warna — tidak ada
  // satu pun halaman yang bisa dibelanjakan.
  //
  // /admin/app.webmanifest tidak perlu disebut: seluruh /admin sudah dikecualikan.
  // /pwa/splash SENGAJA di luar /admin walau juga melayani app admin — sama
  // seperti manifest, iOS mengambilnya tanpa cookie sesi sama sekali.
  const isPwaAsset =
    nextUrl.pathname === "/manifest.webmanifest" ||
    nextUrl.pathname === "/sw.js" ||
    nextUrl.pathname === "/offline" ||
    nextUrl.pathname === "/pwa/splash" ||
    nextUrl.pathname.startsWith("/icons/");

  // Berkas verifikasi kepemilikan domain (Digital Asset Links untuk app Android
  // TWA, dan sejenisnya di masa depan). Alasannya sama persis dengan aset PWA di
  // atas: diambil TANPA cookie sesi, dan rewrite maintenance membalas HTTP 200
  // berisi HTML — Chrome membacanya sebagai berkas verifikasi yang rusak, lalu
  // app yang SUDAH TERPASANG di HP orang mendadak menampilkan address bar.
  // Yang terbuka cuma nama paket dan sidik jari sertifikat, dua-duanya memang
  // informasi publik: sidik jari itu justru ada supaya bisa dicocokkan siapa pun.
  const isWellKnown = nextUrl.pathname.startsWith("/.well-known/");

  // Jalur pemulihan/identitas akun. Dikecualikan dengan alasan yang sama persis
  // dengan /login yang sudah lama ada di daftar ini: link-link ini masuk lewat
  // EMAIL, kedaluwarsa dalam 30 menit, dan sekali pakai - orang yang membukanya
  // saat toko kebetulan sedang maintenance akan melihat halaman maintenance,
  // mengira link-nya rusak, dan tokennya keburu mati sebelum toko dibuka lagi.
  // Untuk /konfirmasi-email akibatnya paling mahal: yang sedang memindahkan
  // alamat email bisa jadi ADMIN yang menyalakan maintenance itu sendiri.
  //
  // Tidak ada yang bocor: kedua halaman ini tidak menampilkan satu pun isi toko,
  // dan tokennyalah yang jadi kredensial, bukan sesi.
  const isAccountRecovery =
    nextUrl.pathname === "/konfirmasi-email" ||
    nextUrl.pathname === "/reset-password" ||
    nextUrl.pathname === "/forgot-password" ||
    // Link aktivasi reseller: sama persis sifatnya - masuk lewat email, 30
    // menit, sekali pakai. Yang membukanya saat maintenance menyala akan
    // melihat halaman maintenance, mengira link-nya rusak, dan tokennya keburu
    // mati sebelum toko dibuka lagi.
    nextUrl.pathname === "/reseller/aktivasi";

  const isExemptFromMaintenance =
    nextUrl.pathname === "/maintenance" ||
    nextUrl.pathname.startsWith("/admin") ||
    nextUrl.pathname.startsWith("/mitra") ||
    nextUrl.pathname.startsWith("/api") ||
    isPwaAsset ||
    isWellKnown ||
    isAccountRecovery ||
    nextUrl.pathname === "/login";
  if (!isExemptFromMaintenance && (await isMaintenanceModeOn())) {
    return NextResponse.rewrite(new URL("/maintenance", nextUrl));
  }

  // ===== Admin wajib 2FA =====
  //
  // DITEGAKKAN DI SINI, bukan di layout admin, dan itu keputusan yang lahir dari
  // kegagalan nyata di produksi.
  //
  // Versi pertama menaruhnya di `admin/layout.tsx` dan menitipkan pathname lewat
  // header buatan sendiri, karena Server Component tidak diberi tahu route mana
  // yang sedang dibuka. Dua hal membuatnya rapuh:
  //
  //  1. Layout Next.js TIDAK dijalankan ulang saat berpindah halaman dari dalam
  //     aplikasi — hanya saat halaman dimuat penuh. Jadi penegakannya menyala di
  //     sebagian jalur dan tidak di jalur lain, dan bedanya tidak terlihat saat
  //     dicoba biasa.
  //  2. Ketika headernya tidak sampai, layout tidak punya cara tahu dia sedang
  //     berada DI halaman tujuan — jadi halaman Keamanan mengalihkan dirinya
  //     sendiri dan admin terkunci dari seluruh panel.
  //
  // Middleware tidak punya dua masalah itu: dia jalan di SETIAP request tanpa
  // kecuali, dan `nextUrl.pathname` selalu ada. Tidak ada header buatan, tidak
  // ada keadaan "posisi tidak diketahui", jadi pengalihan ke diri sendiri
  // mustahil terjadi.
  //
  // Manifest app admin juga dikecualikan di sini. Gerbang di atas sudah
  // melewatkannya, tapi tanpa pengecualian kedua ini seorang admin yang belum
  // memasang 2FA akan membuat manifest-nya dibalas pengalihan ke
  // /admin/keamanan - dan gejalanya bukan pesan error, melainkan app yang
  // sekadar tidak mau terpasang.
  if (
    nextUrl.pathname.startsWith("/admin") &&
    !nextUrl.pathname.startsWith("/admin/keamanan") &&
    !isAdminManifest &&
    // Karyawan ikut WAJIB 2FA, bukan cuma pemilik toko. Akun karyawan memegang
    // akses ke pesanan, harga, dan data pembeli - password saja tidak cukup,
    // dan justru akun karyawanlah yang paling mungkin passwordnya dipakai ulang
    // di tempat lain.
    user &&
    canEnterAdmin(user.role)
  ) {
    const me = await db.user.findUnique({ where: { id: user.id }, select: { totpEnabledAt: true } });
    // Dibaca dari DATABASE, bukan dari isi sesi: JWT di sini stateless dengan
    // masa 8 jam, jadi token yang terbit sebelum 2FA dipasang akan terus
    // mengklaim keadaan lama sampai kedaluwarsa.
    if (!me?.totpEnabledAt) {
      return NextResponse.redirect(new URL("/admin/keamanan", nextUrl));
    }
  }
});

export const config = {
  matcher: [
    "/admin/:path*", "/account/:path*", "/mitra/:path*", "/login", "/register", "/api/:path*",
    "/((?!api|admin|_next/static|_next/image|favicon.ico).*)",
  ],
};
