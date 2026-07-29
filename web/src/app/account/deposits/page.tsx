import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { DEPOSIT_STATUS_LABEL } from "@/lib/order/status-labels";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export default async function AccountDepositsPage() {
  const session = await auth();
  const deposits = await db.deposit.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <h1 className="font-heading text-2xl font-bold">Riwayat Deposit</h1>
      {deposits.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada deposit.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {deposits.map((deposit) => (
            <Link
              key={deposit.id}
              href={`/account/deposit/${deposit.id}`}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
            >
              <p className="font-medium">{formatRupiah(deposit.amount)}</p>
              <Badge variant="muted">{DEPOSIT_STATUS_LABEL[deposit.status] ?? deposit.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
