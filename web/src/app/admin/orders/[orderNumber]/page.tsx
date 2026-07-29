import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { OrderActions } from "./order-actions";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      payment: true,
      fulfillments: { orderBy: { attemptNo: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  const latestFulfillment = order.fulfillments[0];
  const canRetryRefund = Boolean(order.userId) && latestFulfillment?.status === "FAILED";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/admin/orders" className="text-sm text-primary hover:underline">← Orders</Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{order.orderNumber}</h1>
          <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Info Order</h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Produk</dt>
              <dd>{order.productName} · {order.itemName}</dd>
              <dt className="text-muted-foreground">Pembeli</dt>
              <dd>{order.buyerEmail ?? "-"} / {order.buyerPhone ?? "-"}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="tabular-nums">{formatRupiah(order.total)}</dd>
              <dt className="text-muted-foreground">Metode Bayar</dt>
              <dd>{order.paidVia ?? "-"}</dd>
              <dt className="text-muted-foreground">Target</dt>
              <dd>{JSON.stringify(order.target)}</dd>
            </dl>
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Percobaan Fulfillment</h2>
            {order.fulfillments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada percobaan.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {order.fulfillments.map((f) => (
                  <li key={f.id} className="rounded border p-2">
                    <p>Attempt {f.attemptNo} · {f.provider} ({f.providerSkuCode}) · <Badge variant="muted">{f.status}</Badge></p>
                    {f.sn && <p className="text-xs text-muted-foreground">SN: {f.sn}</p>}
                    {f.message && <p className="text-xs text-muted-foreground">{f.message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10 p-4">
            <h2 className="text-sm font-semibold mb-2">Riwayat Status</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {order.statusHistory.map((h) => (
                <li key={h.id} className="border-b pb-2 last:border-0">
                  <p>{h.fromStatus ?? "-"} → {h.toStatus} <span className="text-xs text-muted-foreground">({formatDateTime(h.createdAt)})</span></p>
                  {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            canRetryRefund={canRetryRefund}
          />
        </div>
      </div>
    </div>
  );
}
