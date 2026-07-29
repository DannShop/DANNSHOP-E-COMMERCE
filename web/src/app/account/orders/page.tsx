import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export default async function AccountOrdersPage() {
  const session = await auth();
  const orders = await db.order.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <h1 className="font-heading text-2xl font-bold">Riwayat Transaksi</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/invoice/${order.orderNumber}`}
              className="flex items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:bg-muted"
            >
              <div>
                <p className="font-medium">
                  {order.productName} · {order.itemName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.orderNumber} · {formatRupiah(order.total)}
                </p>
              </div>
              <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
