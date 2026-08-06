import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AccountShell } from "./account-shell";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Sesi diambil di sini (Server Component) lalu diturunkan sebagai prop -
  // AccountShell adalah Client Component, tidak bisa memanggil auth() sendiri.
  // Pola yang sama dipakai admin/layout.tsx.
  return (
    <AccountShell
      userName={session.user.name ?? "Member"}
      userEmail={session.user.email ?? ""}
    >
      {children}
    </AccountShell>
  );
}
