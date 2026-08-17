import { db } from "@/lib/db";
import { REVENUE_STATUSES } from "@/lib/reports/sales";
import { computeProfit, type ProfitBreakdown } from "@/lib/order/cost-snapshot";

// Satu tempat yang menyusun SELURUH angka dashboard & analytics.
//
// Dikumpulkan di sini, bukan disebar sebagai query di tiap halaman, karena
// dashboard dan analytics menampilkan angka yang sama dengan bingkai berbeda -
// dan dua salinan query yang "kurang lebih sama" adalah cara paling mudah
// membuat dua halaman melaporkan omzet berbeda untuk periode yang sama.
//
// Ambang "omzet" mengikuti REVENUE_STATUSES yang sudah ada (lib/reports/sales.ts),
// bukan daftar baru - kalau definisi omzet bergeser, ia bergeser di satu tempat.

export interface DailyPoint {
  /** YYYY-MM-DD, waktu lokal server. */
  date: string;
  orders: number;
  revenue: number;
  profit: number;
  /** Order pada hari itu yang modalnya belum tercatat. */
  ordersWithoutCost: number;
}

export interface OverviewTotals extends ProfitBreakdown {
  orderCount: number;
  /** Seluruh uang masuk periode ini, termasuk order yang modalnya tak tercatat. */
  totalRevenue: bigint;
  averageOrder: bigint;
  /** Basis poin (100 = 1%). Dihitung HANYA dari order yang modalnya tercatat. */
  marginBp: number;
}

export interface PeopleCounts {
  /** User unik yang PUNYA order dibayar dalam periode ini. */
  buyersTransacting: number;
  /** User login unik yang membuka situs dalam periode ini. */
  membersVisiting: number;
  newUsers: number;
  resellersTotal: number;
  resellersPaid: number;
  partnersTotal: number;
  partnersActive: number;
}

export interface OverviewData {
  totals: OverviewTotals;
  daily: DailyPoint[];
  people: PeopleCounts;
  topProducts: { productName: string; orders: number; revenue: bigint; profit: bigint }[];
  byCategory: { name: string; orders: number; revenue: bigint }[];
  paymentMix: { method: string; orders: number; revenue: bigint }[];
}

/** Kunci hari LOKAL. `toISOString()` akan menggeser hari untuk WIB (UTC+7). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Deret tanggal lengkap dari `from` sampai `to`, termasuk hari yang nol order. */
function dateRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  // Hari tanpa transaksi WAJIB ikut muncul sebagai nol. Kalau hanya hari yang
  // ada datanya yang digambar, grafiknya diam-diam memampatkan waktu dan
  // penurunan drastis justru terlihat seperti garis yang baik-baik saja.
  while (cursor <= last && keys.length < 400) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export async function getOverview(from: Date, to: Date): Promise<OverviewData> {
  const range = { gte: from, lte: to };

  const [orders, buyers, visitors, newUsers, resellers, resellersPaid, partners, partnersActive, categories] =
    await Promise.all([
      // Ditarik sebagai baris, bukan aggregate, karena laba menuntut pasangan
      // (total, costPrice) per order - dan `costPrice` yang null harus DIKELUARKAN
      // dari perhitungan, bukan dijumlah sebagai nol. Aggregate SQL tidak bisa
      // membedakan keduanya tanpa dua query terpisah yang harus tetap konsisten.
      db.order.findMany({
        where: { status: { in: REVENUE_STATUSES }, createdAt: range },
        select: {
          createdAt: true,
          total: true,
          costPrice: true,
          productName: true,
          paymentMethod: true,
          userId: true,
          // Order menyimpan productItemId sebagai skalar TANPA relasi Prisma
          // (snapshot-nya productName/itemName), jadi kategori diambil lewat
          // query kedua di bawah - bukan lewat join yang tidak ada.
          productItemId: true,
        },
      }),
      db.order.groupBy({
        by: ["userId"],
        where: { status: { in: REVENUE_STATUSES }, createdAt: range, userId: { not: null } },
      }),
      db.pageView.groupBy({ by: ["userId"], where: { createdAt: range, userId: { not: null } } }),
      db.user.count({ where: { createdAt: range } }),
      db.resellerAccount.count({ where: { activatedAt: { not: null } } }),
      db.resellerAccount.count({ where: { activatedAt: { not: null }, tierId: { not: null } } }),
      db.partnerAccount.count(),
      db.partnerAccount.count({ where: { isActive: true } }),
      db.category.findMany({ select: { name: true } }),
    ]);

  // Kategori dipetakan terpisah. Item yang sudah dihapus tidak akan ketemu, dan
  // itu ditangani sebagai "Tanpa kategori" - order lamanya tetap harus terhitung.
  const itemIds = [...new Set(orders.map((o) => o.productItemId).filter((id): id is string => id !== null))];
  const itemCategories = itemIds.length
    ? await db.productItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, product: { select: { category: { select: { name: true } } } } },
      })
    : [];
  const categoryByItem = new Map(itemCategories.map((i) => [i.id, i.product.category.name]));

  const totalsProfit = computeProfit(orders);
  const totalRevenue = totalsProfit.revenueWithCost + totalsProfit.revenueWithoutCost;
  const orderCount = orders.length;

  // Margin dihitung dari basis yang modalnya diketahui saja. Membaginya dengan
  // seluruh omzet akan menghasilkan persentase yang selalu terlihat lebih kecil
  // dari kenyataan, sebanding dengan berapa banyak modal yang belum diisi.
  const marginBp =
    totalsProfit.revenueWithCost > 0n
      ? Number((totalsProfit.profit * 10_000n) / totalsProfit.revenueWithCost)
      : 0;

  const byDay = new Map<string, { orders: number; revenue: bigint; withCostRevenue: bigint; cost: bigint; withoutCost: number }>();
  for (const key of dateRange(from, to)) {
    byDay.set(key, { orders: 0, revenue: 0n, withCostRevenue: 0n, cost: 0n, withoutCost: 0 });
  }
  for (const order of orders) {
    const bucket = byDay.get(dayKey(order.createdAt));
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += order.total;
    if (order.costPrice === null) bucket.withoutCost += 1;
    else {
      bucket.withCostRevenue += order.total;
      bucket.cost += order.costPrice;
    }
  }

  const daily: DailyPoint[] = [...byDay.entries()].map(([date, b]) => ({
    date,
    orders: b.orders,
    // Number() di batas tampilan saja. Rupiah harian toko ini jauh di bawah
    // Number.MAX_SAFE_INTEGER, dan Recharts tidak bisa menggambar BigInt.
    revenue: Number(b.revenue),
    profit: Number(b.withCostRevenue - b.cost),
    ordersWithoutCost: b.withoutCost,
  }));

  const productMap = new Map<string, { orders: number; revenue: bigint; profit: bigint }>();
  const categoryMap = new Map<string, { orders: number; revenue: bigint }>();
  const paymentMap = new Map<string, { orders: number; revenue: bigint }>();
  for (const order of orders) {
    const p = productMap.get(order.productName) ?? { orders: 0, revenue: 0n, profit: 0n };
    p.orders += 1;
    p.revenue += order.total;
    if (order.costPrice !== null) p.profit += order.total - order.costPrice;
    productMap.set(order.productName, p);

    const catName = (order.productItemId ? categoryByItem.get(order.productItemId) : null) ?? "Tanpa kategori";
    const c = categoryMap.get(catName) ?? { orders: 0, revenue: 0n };
    c.orders += 1;
    c.revenue += order.total;
    categoryMap.set(catName, c);

    const method = order.paymentMethod ?? "—";
    const m = paymentMap.get(method) ?? { orders: 0, revenue: 0n };
    m.orders += 1;
    m.revenue += order.total;
    paymentMap.set(method, m);
  }

  const sortByRevenue = <T extends { revenue: bigint }>(a: T, b: T) => (b.revenue > a.revenue ? 1 : b.revenue < a.revenue ? -1 : 0);

  return {
    totals: {
      ...totalsProfit,
      orderCount,
      totalRevenue,
      averageOrder: orderCount > 0 ? totalRevenue / BigInt(orderCount) : 0n,
      marginBp,
    },
    daily,
    people: {
      buyersTransacting: buyers.length,
      membersVisiting: visitors.length,
      newUsers,
      resellersTotal: resellers,
      resellersPaid,
      partnersTotal: partners,
      partnersActive,
    },
    topProducts: [...productMap.entries()]
      .map(([productName, v]) => ({ productName, ...v }))
      .sort(sortByRevenue)
      .slice(0, 10),
    byCategory: [...categoryMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort(sortByRevenue)
      .slice(0, Math.max(6, categories.length)),
    paymentMix: [...paymentMap.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort(sortByRevenue),
  };
}
