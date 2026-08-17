// Digital Asset Links — yang membuat app Android (TWA) dipercaya sebagai
// "pemilik" domain ini.
//
// ===== KENAPA BERKAS INI MENENTUKAN HIDUP-MATINYA APP =====
//
// TWA (Trusted Web Activity) adalah Chrome tanpa address bar yang membuka situs
// kita. Chrome hanya menyembunyikan address bar itu kalau ia bisa MEMBUKTIKAN
// bahwa pemilik APK dan pemilik domain adalah pihak yang sama — dan satu-satunya
// bukti yang ia terima adalah berkas ini, diambil dari
// https://<domain>/.well-known/assetlinks.json.
//
// Kalau verifikasinya gagal, app-nya TETAP JALAN tapi menampilkan address bar
// Chrome di atas layar. Tidak ada pesan error, tidak ada tanda apa pun selain
// batang alamat yang tiba-tiba muncul — dan itulah bedanya "aplikasi" dengan
// "browser yang dibuka dari home screen".
//
// ⚠️ Diambil Chrome TANPA cookie sesi, sama seperti manifest. Karena itu route
// ini juga dikecualikan dari rewrite maintenance di proxy.ts (cari
// `isWellKnown` di sana) — kalau ikut di-rewrite, yang diterima Chrome adalah
// HTML halaman maintenance, verifikasinya gagal, dan address bar muncul di app
// yang sudah terpasang di HP orang.

import { NextResponse } from "next/server";

// Nilai dibaca saat request, bukan saat build — supaya mengganti fingerprint
// (mis. setelah mengaktifkan Play App Signing) cukup mengubah env di Vercel.
export const dynamic = "force-dynamic";

/**
 * Bentuk sah sebuah fingerprint SHA-256: 32 pasang hex dipisah titik dua.
 *
 * Divalidasi, bukan diteruskan apa adanya. Fingerprint yang salah ketik tetap
 * menghasilkan JSON yang terlihat benar, dan gejalanya cuma address bar yang
 * muncul tanpa sebab yang jelas — jauh lebih mahal dicari daripada dicegah.
 */
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function parseFingerprints(raw: string | undefined): string[] {
  if (!raw) return [];
  // Koma ATAU baris baru: menempel dari Play Console memberi satu per baris,
  // sementara env var di Vercel lebih enak ditulis satu baris dipisah koma.
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => FINGERPRINT_RE.test(s));
}

export async function GET() {
  const packageName = process.env.TWA_PACKAGE_NAME?.trim();
  const fingerprints = parseFingerprints(process.env.TWA_SHA256_FINGERPRINTS);

  // Belum dikonfigurasi = 404, BUKAN array kosong. Array kosong adalah jawaban
  // yang sah menurut spesifikasi dan berarti "tidak ada app yang saya percayai",
  // jadi Chrome berhenti mencoba dan meng-cache penolakan itu. 404 membuatnya
  // memperlakukan ini sebagai "belum siap" dan mencoba lagi nanti.
  if (!packageName || fingerprints.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];

  return NextResponse.json(statements, {
    headers: {
      // Chrome memverifikasi sekali lalu menyimpan hasilnya, jadi cache panjang
      // di CDN tidak menunda apa pun. s-maxage (bukan max-age) supaya yang
      // menyimpan CDN-nya dan bisa dibatalkan dengan redeploy.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
