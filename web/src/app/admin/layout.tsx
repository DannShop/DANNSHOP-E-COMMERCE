import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/login");

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
    >
      {children}
    </AdminShell>
  );
}
