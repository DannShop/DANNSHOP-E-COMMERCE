import { db } from "@/lib/db";
import type { OrderStatus } from "@prisma/client";

// Status yang dihitung sebagai "omzet" - uang sudah benar-benar diterima dan
// belum (atau tidak akan) dikembalikan. Sengaja TIDAK termasuk
// PENDING_PAYMENT/EXPIRED/FAILED (belum pernah dibayar) maupun REFUNDED
// (sudah dikembalikan). REFUND_PENDING masih dihitung karena dananya masih
// di tangan kita selama refund belum tuntas - laporan ini murni untuk
// gambaran cepat admin, bukan pembukuan akuntansi resmi.
export const REVENUE_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "COMPLETED", "NEEDS_REVIEW", "REFUND_PENDING"];

export interface SalesSummary {
  totalRevenue: bigint;
  orderCount: number;
  byStatus: { status: OrderStatus; count: number; revenue: bigint }[];
  topProducts: { productName: string; count: number; revenue: bigint }[];
}

export async function getSalesSummary(from: Date, to: Date): Promise<SalesSummary> {
  const [totals, byStatusRaw, topProductsRaw] = await Promise.all([
    db.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
      _sum: { total: true },
      _count: true,
    }),
    db.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: from, lte: to } },
      _count: true,
      _sum: { total: true },
    }),
    db.order.groupBy({
      by: ["productName"],
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
      _count: true,
      _sum: { total: true },
      orderBy: { _count: { productName: "desc" } },
      take: 10,
    }),
  ]);

  return {
    totalRevenue: totals._sum.total ?? 0n,
    orderCount: totals._count,
    byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count, revenue: r._sum.total ?? 0n })),
    topProducts: topProductsRaw.map((r) => ({
      productName: r.productName,
      count: r._count,
      revenue: r._sum.total ?? 0n,
    })),
  };
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
