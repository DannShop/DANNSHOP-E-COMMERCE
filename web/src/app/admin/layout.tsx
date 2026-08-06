import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/login");

  // Sesi diambil di sini (Server Component) lalu diturunkan sebagai prop -
  // AdminShell adalah Client Component, tidak bisa memanggil auth() sendiri.
  return (
    <AdminShell userEmail={session.user.email ?? "admin"} userRole={session.user.role}>
      {children}
    </AdminShell>
  );
}
