import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import type { OrderStatus } from "@prisma/client";

const TABS = [
  { key: "all", label: "Semua", statuses: null },
  { key: "needs_review", label: "Butuh Perhatian", statuses: ["NEEDS_REVIEW"] as OrderStatus[] },
  { key: "refund_pending", label: "Refund Pending", statuses: ["REFUND_PENDING"] as OrderStatus[] },
] as const;

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab: rawTab, q } = await searchParams;
  const activeTab = TABS.find((t) => t.key === rawTab) ?? TABS[0];

  const where = {
    ...(activeTab.statuses ? { status: { in: activeTab.statuses } } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q } },
            { buyerEmail: { contains: q } },
            { buyerPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Orders</h1>
        <p className="text-sm text-muted-foreground">Daftar order, filter status, dan pencarian.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/orders?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded px-3 py-1.5 text-sm ${activeTab.key === t.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/admin/orders" className="flex gap-2">
          <input type="hidden" name="tab" value={activeTab.key} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Cari nomor order / email / HP" className="w-64" />
          <Button type="submit" variant="outline">Cari</Button>
        </form>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor Order</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead>Pembeli</TableHead>
              <TableHead className="tabular-nums">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Tidak ada order.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium hover:underline">
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">{order.productName} · {order.itemName}</TableCell>
                  <TableCell>{order.buyerEmail ?? order.buyerPhone ?? "-"}</TableCell>
                  <TableCell className="tabular-nums">{formatRupiah(order.total)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
