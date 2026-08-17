import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings";
import { getInvoiceBranding } from "@/lib/invoice/branding";
import { getPwaSettings } from "@/lib/pwa/settings";
import { resolveAppNames, resolveIcon } from "@/lib/pwa/config";
import { appearanceVersion, buildStartupImages } from "@/lib/pwa/splash";
import { AdminShell } from "./admin-shell";

// Panel admin adalah aplikasi mobile KEDUA, terpisah dari app toko.
//
// Metadata di sini menimpa milik layout root untuk seluruh /admin, sehingga
// memasang app dari halaman panel menghasilkan pintasan yang membuka /admin
// langsung — bukan halaman depan toko.
//
// `icons` ditulis LENGKAP (icon + apple), bukan cuma apple: penggabungan
// metadata Next.js bersifat dangkal, jadi menyebut sebagian field akan
// menghapus favicon yang diatur layout root.
export async function generateMetadata(): Promise<Metadata> {
  const [settings, pwa, branding] = await Promise.all([
    getSiteSettings(),
    getPwaSettings(),
    getInvoiceBranding(),
  ]);
  const { shortName } = resolveAppNames(pwa.admin, "admin", branding.brandName);

  return {
    manifest: "/admin/app.webmanifest",
    icons: {
      icon: settings.faviconUrl ?? "/favicon.ico",
      apple: resolveIcon(pwa.admin, "admin").any,
    },
    appleWebApp: {
      capable: true,
      title: shortName,
      statusBarStyle: "default",
      // Daftar milik app ADMIN, bukan warisan dari layout root: penggabungan
      // metadata Next.js bersifat dangkal, jadi menyebut `appleWebApp` di sini
      // sudah menghapus seluruh milik root — termasuk startupImage-nya. Yang
      // benar memang begitu, app admin punya warna & ikonnya sendiri.
      startupImage: buildStartupImages("admin", appearanceVersion(pwa.admin)),
    },
  };
}

// Menimpa warna bilah status milik layout root untuk seluruh /admin. Panel ini
// app yang berbeda dengan palet yang berbeda; tanpa ini bilah statusnya memakai
// warna toko dan terlihat seperti masih berada di dalam app yang salah.
export async function generateViewport(): Promise<Viewport> {
  const pwa = await getPwaSettings();
  return { themeColor: pwa.admin.themeColor };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/login");

  // Admin yang belum memasang 2FA diarahkan ke halaman Keamanan dan tidak bisa
  // ke mana-mana sebelum memasangnya.
  //
  // Ditegakkan DI LAYOUT, bukan di tiap halaman: layout adalah satu-satunya
  // tempat yang pasti dilewati SETIAP route admin, termasuk yang ditambahkan
  // besok oleh orang yang belum pernah membaca catatan ini. Penegakan per-halaman
  // hanya kuat selama tidak ada yang lupa.
  //
  // Dicek dari DATABASE, bukan dari isi sesi: JWT di sini stateless dengan masa
  // 8 jam, jadi token yang terbit sebelum 2FA dipasang akan terus mengklaim
  // keadaan lama sampai kedaluwarsa. Pola yang sama dipakai penegakan ban.
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabledAt: true },
  });
  //
  // PENGALIHANNYA TIDAK DI SINI — ada di middleware (proxy.ts), yang selalu tahu
  // pathname dan selalu jalan di tiap request. Layout hanya menyalakan spanduk
  // peringatan. Alasan lengkapnya ada di proxy.ts; ringkasnya: layout tidak
  // dijalankan ulang saat berpindah halaman dari dalam aplikasi, jadi penegakan
  // di sini menyala tidak konsisten dan sempat mengunci admin di produksi.
  const needsTwoFactor = !me?.totpEnabledAt;

  // Sengaja SETELAH gerbang admin, bukan di-Promise.all bareng auth(): pengunjung
  // yang tidak berhak tidak perlu memicu query apa pun sebelum ditendang.
  const settings = await getSiteSettings();

  // Sesi & pengaturan situs diambil di sini (Server Component) lalu diturunkan
  // sebagai prop - AdminShell adalah Client Component, tidak bisa memanggil
  // auth()/getSiteSettings() sendiri.
  return (
    <AdminShell
      userEmail={session.user.email ?? "admin"}
      userRole={session.user.role}
      logoUrl={settings.logoUrl}
      logoType={settings.logoType}
      faviconUrl={settings.faviconUrl}
      needsTwoFactor={needsTwoFactor}
    >
      {children}
    </AdminShell>
  );
}
