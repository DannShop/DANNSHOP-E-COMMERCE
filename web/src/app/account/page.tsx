import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_LABEL, DEPOSIT_STATUS_LABEL } from "@/lib/order/status-labels";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [wallet, recentOrders, recentDeposits] = await Promise.all([
    db.wallet.findUnique({ where: { userId } }),
    db.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.deposit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="font-heading text-2xl font-bold">Akun Saya</h1>
        <p className="text-sm text-muted-foreground">
          Halo, {session.user.name} ({session.user.email})
        </p>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius)] border bg-card p-5">
        <div>
          <p className="text-sm text-muted-foreground">Saldo</p>
          <p className="font-heading text-3xl font-bold text-primary">{formatRupiah(wallet?.balance ?? 0n)}</p>
        </div>
        <Link href="/account/deposit" className={cn(buttonVariants({ size: "default" }))}>
          Isi Saldo
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Transaksi Terakhir</h2>
          <Link href="/account/orders" className="text-sm text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/invoice/${order.publicToken}`}
                className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
              >
                <div>
                  <p className="font-medium">
                    {order.productName} · {order.itemName}
                  </p>
                  <p className="text-xs text-muted-foreground">{order.orderNumber}</p>
                </div>
                <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Riwayat Deposit</h2>
          <Link href="/account/deposits" className="text-sm text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        {recentDeposits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada deposit.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recentDeposits.map((deposit) => (
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
      </div>
    </main>
  );
}
