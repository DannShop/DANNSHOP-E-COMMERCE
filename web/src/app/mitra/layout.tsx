import { redirect } from "next/navigation";
import { getPartnerSession } from "@/lib/partner/session";
import { MitraShell } from "./mitra-shell";

export default async function MitraLayout({ children }: { children: React.ReactNode }) {
  // Sengaja TIDAK memanggil auth() lagi di sini: getPartnerSession() sudah
  // melakukannya di dalam, dan pemanggilan kedua berarti satu putaran verifikasi
  // sesi tambahan di setiap halaman portal tanpa menambah informasi apa pun.
  // Pengunjung yang belum login sudah dicegat proxy.ts sebelum sampai ke sini.
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
