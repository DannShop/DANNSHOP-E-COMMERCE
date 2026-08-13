import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPartnerSession } from "@/lib/partner/session";
import { MitraShell } from "./mitra-shell";

export default async function MitraLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const partner = await getPartnerSession();
  // Bukan 404 dan bukan halaman "akses ditolak": user yang sampai ke sini jelas
  // tertarik jadi mitra, jadi dia diantar ke formulirnya. Halaman itu sendiri
  // yang menjelaskan status pengajuannya kalau sudah pernah mengajukan.
  if (!partner) redirect("/account/mitra");

  return (
    <MitraShell userName={partner.userName} username={partner.username} isActive={partner.isActive}>
      {children}
    </MitraShell>
  );
}
