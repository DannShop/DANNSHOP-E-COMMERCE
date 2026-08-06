import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";

export const metadata: Metadata = { title: "Riwayat Transaksi" };

export default async function AccountOrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const orders = await db.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      {orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          Belum ada transaksi.{" "}
          <Link href="/" className="text-primary hover:underline">
            Mulai belanja
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/invoice/${order.publicToken}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {order.productName} · {order.itemName}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {order.orderNumber} · {formatRupiah(order.total)} ·{" "}
                    {formatTanggal(order.createdAt)}
                  </span>
                </span>
                <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
