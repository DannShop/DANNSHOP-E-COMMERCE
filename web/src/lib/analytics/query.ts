import { db } from "@/lib/db";
import { REVENUE_STATUSES } from "@/lib/reports/sales";

// Agregasi statistik untuk panel admin.
//
// Dua sumber yang sengaja dipisah:
//   - PageView (mentah, retensi terbatas) untuk rentang waktu yang masih
//     tercakup retensi dan untuk tampilan langsung
//   - AnalyticsDaily (rollup permanen) untuk rentang yang lebih panjang
//
// Yang perlu dipahami saat membaca angkanya: "pengunjung unik" dihitung dari
// visitorHash yang GARAMNYA BERGANTI TIAP HARI (lihat lib/analytics/track.ts).
// Artinya unik-per-hari akurat, tapi unik-per-rentang TIDAK BISA dijumlahkan
// begitu saja - satu orang yang datang tiga hari berturut-turut terhitung tiga
// pengunjung. Itu konsekuensi yang disengaja dari tidak melacak orang
// antar-hari, dan setiap tampilan yang memakainya harus menyebutnya apa adanya.

export interface LiveSnapshot {
  /** Sesi berbeda yang membuka halaman dalam 5 menit terakhir. */
  onlineNow: number;
  pageviewsLastHour: number;
  ordersLastHour: number;
  revenueLastHour: bigint;
  recentOrders: {
    orderNumber: string;
    productName: string;
    itemName: string;
    total: string;
    status: string;
    createdAt: string;
  }[];
  generatedAt: string;
}

const ONLINE_WINDOW_MS = 5 * 60_000;

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const now = new Date();
  const online = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const hourAgo = new Date(now.getTime() - 60 * 60_000);

  const [onlineSessions, pageviewsLastHour, orderAgg, recentOrders] = await Promise.all([
    // groupBy sessionId, bukan count() biasa: yang dicari jumlah ORANG, bukan
    // jumlah halaman yang dibuka. Satu pengunjung yang menjelajah cepat bisa
    // menghasilkan sepuluh baris dalam lima menit.
    db.pageView.groupBy({ by: ["sessionId"], where: { createdAt: { gte: online } } }),
    db.pageView.count({ where: { createdAt: { gte: hourAgo } } }),
    db.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: hourAgo } },
      _sum: { total: true },
      _count: true,
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { orderNumber: true, productName: true, itemName: true, total: true, status: true, createdAt: true },
    }),
  ]);

  return {
    onlineNow: onlineSessions.length,
    pageviewsLastHour,
    ordersLastHour: orderAgg._count,
    revenueLastHour: orderAgg._sum.total ?? 0n,
    recentOrders: recentOrders.map((o) => ({
      orderNumber: o.orderNumber,
      productName: o.productName,
      itemName: o.itemName,
      total: o.total.toString(),
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
    generatedAt: now.toISOString(),
  };
}

export interface TrafficSummary {
  pageviews: number;
  visitors: number;
  sessions: number;
  topPaths: { path: string; views: number }[];
  topReferrers: { host: string; views: number }[];
  devices: { device: string; views: number }[];
  daily: { date: string; pageviews: number; visitors: number }[];
  /** true kalau sebagian rentang sudah di luar retensi data mentah. */
  partialFromRollup: boolean;
}

export async function getTrafficSummary(from: Date, to: Date): Promise<TrafficSummary> {
  const [pageviews, visitorRows, sessionRows, pathRows, referrerRows, deviceRows, dailyRows, rollups] =
    await Promise.all([
      db.pageView.count({ where: { createdAt: { gte: from, lte: to } } }),
      db.pageView.groupBy({ by: ["visitorHash"], where: { createdAt: { gte: from, lte: to } } }),
      db.pageView.groupBy({ by: ["sessionId"], where: { createdAt: { gte: from, lte: to } } }),
      db.pageView.groupBy({
        by: ["path"],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        orderBy: { _count: { path: "desc" } },
        take: 15,
      }),
      db.pageView.groupBy({
        by: ["referrerHost"],
        where: { createdAt: { gte: from, lte: to }, referrerHost: { not: null } },
        _count: true,
        orderBy: { _count: { referrerHost: "desc" } },
        take: 10,
      }),
      db.pageView.groupBy({
        by: ["device"],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
      }),
      // Rangkuman per hari dari data mentah. Prisma groupBy tidak bisa
      // mengelompokkan per TANGGAL dari kolom DATETIME, jadi bagian ini pakai
      // SQL mentah - satu-satunya di file ini, dan sengaja tanpa interpolasi
      // string: tanggalnya lewat parameter terikat.
      db.$queryRaw<{ d: Date; pv: bigint; uv: bigint }[]>`
        SELECT DATE(createdAt) AS d, COUNT(*) AS pv, COUNT(DISTINCT visitorHash) AS uv
        FROM PageView
        WHERE createdAt >= ${from} AND createdAt <= ${to}
        GROUP BY DATE(createdAt)
        ORDER BY d ASC
      `,
      db.analyticsDaily.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: "asc" },
      }),
    ]);

  // Hari yang datanya sudah dibuang dari PageView diambil dari rollup. Data
  // mentah selalu menang untuk hari yang punya keduanya - dia lebih rinci dan
  // pasti lebih baru daripada rollup yang dihitung sekali sehari.
  const byDate = new Map<string, { date: string; pageviews: number; visitors: number }>();
  for (const r of rollups) {
    const key = r.date.toISOString().slice(0, 10);
    byDate.set(key, { date: key, pageviews: r.pageviews, visitors: r.visitors });
  }
  let usedRollup = false;
  for (const row of dailyRows) {
    const key = new Date(row.d).toISOString().slice(0, 10);
    byDate.set(key, { date: key, pageviews: Number(row.pv), visitors: Number(row.uv) });
  }
  for (const r of rollups) {
    const key = r.date.toISOString().slice(0, 10);
    if (!dailyRows.some((d) => new Date(d.d).toISOString().slice(0, 10) === key)) usedRollup = true;
  }

  return {
    pageviews,
    visitors: visitorRows.length,
    sessions: sessionRows.length,
    topPaths: pathRows.map((r) => ({ path: r.path, views: r._count })),
    topReferrers: referrerRows.map((r) => ({ host: r.referrerHost ?? "(langsung)", views: r._count })),
    devices: deviceRows.map((r) => ({ device: r.device, views: r._count })),
    daily: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    partialFromRollup: usedRollup,
  };
}

export interface ConversionSummary {
  visitors: number;
  productPageViews: number;
  ordersCreated: number;
  ordersPaid: number;
  revenue: bigint;
  newUsers: number;
}

// Corong kunjungan -> order. Angka "visitors" dan "orders" datang dari dua
// tabel yang tidak saling terhubung, jadi ini rasio kasar untuk melihat tren
// naik/turun - BUKAN pelacakan per orang dari kunjungan sampai pembayaran.
export async function getConversionSummary(from: Date, to: Date): Promise<ConversionSummary> {
  const [visitorRows, productPageViews, ordersCreated, paidAgg, newUsers] = await Promise.all([
    db.pageView.groupBy({ by: ["visitorHash"], where: { createdAt: { gte: from, lte: to } } }),
    // Halaman detail produk = path dua segmen di bawah root yang bukan halaman
    // statis. Dicocokkan dari daftar path yang tercatat, bukan ditebak regex
    // di SQL, supaya tetap benar kalau struktur URL berubah.
    db.pageView.count({
      where: {
        createdAt: { gte: from, lte: to },
        path: { contains: "/" },
        NOT: [
          { path: "/" },
          { path: { startsWith: "/account" } },
          { path: { startsWith: "/invoice" } },
          { path: { startsWith: "/login" } },
          { path: { startsWith: "/register" } },
        ],
      },
    }),
    db.order.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.order.aggregate({
      where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: from, lte: to } },
      _sum: { total: true },
      _count: true,
    }),
    db.user.count({ where: { createdAt: { gte: from, lte: to } } }),
  ]);

  return {
    visitors: visitorRows.length,
    productPageViews,
    ordersCreated,
    ordersPaid: paidAgg._count,
    revenue: paidAgg._sum.total ?? 0n,
    newUsers,
  };
}
