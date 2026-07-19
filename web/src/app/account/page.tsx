import { auth } from "@/lib/auth";

export default async function AccountPage() {
  const session = await auth();
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Akun Saya</h1>
      <p>Halo, {session?.user?.name} ({session?.user?.email})</p>
      <p>Saldo & riwayat transaksi hadir di Fase 4.</p>
    </main>
  );
}
