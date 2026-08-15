import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings";
import { AdminShell } from "./admin-shell";

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
  // GAGALNYA HARUS AMAN. `x-pathname` dipasang middleware (proxy.ts), dan layout
  // TIDAK bisa memastikan header itu selalu sampai — jalur render tertentu tidak
  // melewati middleware sama sekali. Versi pertama penegakan ini mengalihkan
  // kapan pun header tidak cocok, termasuk saat headernya KOSONG: halaman
  // Keamanan lalu mengalihkan dirinya sendiri, berputar tanpa henti, dan admin
  // terkunci dari SELURUH panel — persis kebalikan dari tujuan fitur ini.
  //
  // Sekarang pengalihan hanya terjadi kalau posisinya benar-benar diketahui.
  // Kalau tidak, penegakannya turun jadi spanduk peringatan yang selalu tampil
  // (lihat needsTwoFactor di AdminShell): mengganggu terus-menerus sampai
  // dipasang, tapi tidak pernah mengunci siapa pun di luar.
  const needsTwoFactor = !me?.totpEnabledAt;
  if (needsTwoFactor) {
    const path = (await headers()).get("x-pathname");
    if (path && !path.startsWith("/admin/keamanan")) redirect("/admin/keamanan");
  }

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
