import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { RefreshButton } from "@/components/admin/refresh-button";
import { DateRangeFilter, PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, createdAtFilter, parseDateRange, parsePage, parsePageSize } from "@/lib/admin/pagination";
import { parseBenefits, hasBenefit } from "@/lib/membership/benefits";
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
  searchParams: Promise<{ tab?: string; q?: string; page?: string; per?: string; from?: string; to?: string }>;
}) {
  const { tab: rawTab, q, page: rawPage, per, from: rawFrom, to: rawTo } = await searchParams;
  const activeTab = TABS.find((t) => t.key === rawTab) ?? TABS[0];
  const pageSize = parsePageSize(per);
  const range = parseDateRange(rawFrom, rawTo);

  const where = {
    ...(activeTab.statuses ? { status: { in: activeTab.statuses } } : {}),
    ...createdAtFilter(range),
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

  const total = await db.order.count({ where });
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);
  const orders = await db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  // Lencana prioritas (benefit "priority_badge") - batch query, bukan N+1 per
  // baris. Guest (userId null) tidak mungkin punya tier, jadi difilter dulu.
  const buyerIds = [...new Set(orders.map((o) => o.userId).filter((id): id is string => id !== null))];
  const activeMemberships =
    buyerIds.length > 0
      ? await db.userMembership.findMany({
          where: { userId: { in: buyerIds }, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "desc" },
          include: { tier: { select: { name: true, badgeColor: true, benefits: true } } },
        })
      : [];
  // expiresAt desc + "ambil kemunculan pertama per user" = tier AKTIF user itu
  // (expiresAt terbesar), konsisten dengan aturan yang sama di
  // lib/membership/tier.ts getMembershipContext - kalau tier aktifnya sendiri
  // tidak punya priority_badge, tier lain yang overlap (kasus langka) tidak
  // ikut dipertimbangkan.
  const currentMembershipByUser = new Map<string, (typeof activeMemberships)[number]>();
  for (const m of activeMemberships) {
    if (!currentMembershipByUser.has(m.userId)) currentMembershipByUser.set(m.userId, m);
  }
  const priorityBadgeByUser = new Map<string, { name: string; color: string }>();
  for (const [uid, m] of currentMembershipByUser) {
    if (hasBenefit(parseBenefits(m.tier.benefits), "priority_badge")) {
      priorityBadgeByUser.set(uid, { name: m.tier.name, color: m.tier.badgeColor });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">Daftar order, filter status, tanggal, dan pencarian.</p>
        </div>
        <RefreshButton />
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
          <input type="hidden" name="per" value={pageSize} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Cari nomor order / email / HP" className="w-64" />
          <Button type="submit" variant="outline">Cari</Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter from={rawFrom ?? ""} to={rawTo ?? ""} />
        <PageSizeSelect value={pageSize} />
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
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {order.buyerEmail ?? order.buyerPhone ?? "-"}
                      {order.userId && priorityBadgeByUser.has(order.userId) && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: priorityBadgeByUser.get(order.userId)!.color }}
                          title="Member tier prioritas - dahulukan penanganan"
                        >
                          {priorityBadgeByUser.get(order.userId)!.name}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatRupiah(order.total)}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{ORDER_STATUS_LABEL[order.status] ?? order.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination info={pagination} />
      </div>
    </div>
  );
}
