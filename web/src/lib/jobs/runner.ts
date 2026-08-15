import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";
import { applyFulfillmentResult, dispatchFulfillment, escalateOrder } from "@/lib/order/fulfillment";
import { getAdapter } from "@/lib/providers/registry";
import type { TopupProviderAdapter } from "@/lib/providers/types";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { sendPartnerCallback } from "@/lib/partner/callback";
import { applyBalanceAlert } from "@/lib/providers/balance-sync";

export type JobHandler = (payload: unknown) => Promise<string | void>;

const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

// attempts = jumlah percobaan yang SUDAH gagal (1-based saat dipanggil)
export function computeBackoff(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
}

export function decideAfterFailure(
  job: { attempts: number; maxAttempts: number },
  now: Date,
): { status: "PENDING" | "FAILED"; runAt: Date } {
  if (job.attempts >= job.maxAttempts) return { status: "FAILED", runAt: now };
  return { status: "PENDING", runAt: new Date(now.getTime() + computeBackoff(job.attempts) * 60_000) };
}

export function shouldEscalateRecheck(attempt: number, status: "success" | "pending" | "failed"): boolean {
  if (status !== "pending") return false;
  return attempt >= 30;
}

export const handlers: Record<string, JobHandler> = {
  // payload: { provider: "DIGIFLAZZ" }
  "sync-prices": async (payload) => {
    const provider = (payload as { provider: ProviderKey }).provider;
    const result = await runPriceSync(provider);
    // Self-rescheduling: sync berikutnya 3 jam lagi (spec §5.5)
    await db.job.create({
      data: {
        type: "sync-prices",
        payload: { provider },
        runAt: new Date(Date.now() + 3 * 60 * 60_000),
      },
    });
    return `updated=${result.updated} missing=${result.missing} repriced=${result.repriced}`;
  },

  // payload: { orderId }
  //
  // Pemberitahuan hasil transaksi ke server partner (H2H). Sengaja TIDAK
  // menangkap error sendiri: kegagalan dilempar apa adanya supaya runDueJobs
  // memakai backoff & maxAttempts generiknya — server partner yang sedang mati
  // beberapa menit akan tersusul sendiri tanpa kode retry khusus di sini.
  "partner-callback": async (payload) => {
    const { orderId } = payload as { orderId: string };
    await sendPartnerCallback(orderId);
    return `callback terkirim untuk order ${orderId}`;
  },

  "expire-order": async (payload) => {
    const { orderId } = payload as { orderId: string };
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.status !== "PENDING_PAYMENT") return "no-op: status sudah berubah";
    if (order.expiredAt && order.expiredAt > new Date()) return "no-op: belum jatuh tempo";

    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "EXPIRED" },
    });
    if (claimed.count === 0) return "no-op: sudah diklaim proses lain";

    await db.orderPayment.updateMany({ where: { orderId: order.id }, data: { status: "EXPIRED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "EXPIRED", note: "Auto-expire cron" },
    });
    return "expired";
  },

  "expire-deposit": async (payload) => {
    const { depositId } = payload as { depositId: string };
    const deposit = await db.deposit.findUniqueOrThrow({ where: { id: depositId } });
    if (deposit.status !== "PENDING") return "no-op: status sudah berubah";
    if (deposit.expiredAt && deposit.expiredAt > new Date()) return "no-op: belum jatuh tempo";

    const claimed = await db.deposit.updateMany({
      where: { id: deposit.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    if (claimed.count === 0) return "no-op: sudah diklaim proses lain";

    return "expired";
  },

  "reconcile-paid-orders": async () => {
    const STALE_MINUTES = 5;
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60_000);
    const staleOrders = await db.order.findMany({
      where: { status: "PAID", updatedAt: { lte: staleThreshold } },
      select: { id: true },
      // Dibatasi kecil (bukan 20) supaya satu invocation pasti selesai dalam
      // budget request/timeout cron-tick normal - tiap order bisa makan waktu
      // sampai ~15s (timeout dispatchFulfillment ke provider).
      take: 5,
    });
    for (const order of staleOrders) {
      await dispatchFulfillment(order.id);
    }
    return `reconciled=${staleOrders.length}`;
  },

  "check-provider-balance": async () => {
    const providers = await db.providerConfig.findMany({
      where: { isActive: true, minBalanceAlert: { not: null } },
    });

    for (const provider of providers) {
      let balance: bigint;
      try {
        const adapter = await getAdapter(provider.key);
        balance = await adapter.fetchBalance();
      } catch (e) {
        // Sama persis dengan tombol "Cek Saldo" manual (actions/providers.ts) - gangguan
        // API sesaat itu wajar, tidak boleh alert Telegram tiap kali jaringan blip.
        console.error("check-provider-balance: fetchBalance gagal, dilewati", { provider: provider.key, error: e });
        await db.providerConfig.update({
          where: { key: provider.key },
          data: { healthStatus: "DOWN", lastHealthCheckAt: new Date() },
        });
        continue;
      }

      await db.providerConfig.update({
        where: { key: provider.key },
        data: { balance, healthStatus: "HEALTHY", lastHealthCheckAt: new Date() },
      });
      await db.providerBalanceLog.create({ data: { providerId: provider.id, balance } });

      // Evaluasi alert dipusatkan di applyBalanceAlert() supaya jalur cron ini,
      // tombol "Cek Saldo" manual, dan penyimpanan ambang batas tidak pernah
      // berbeda perilaku. Sebelumnya logikanya hanya ada di sini, dan dua jalur
      // lain diam-diam melewatkannya.
      await applyBalanceAlert(provider, balance);
    }

    // Self-reschedule tiap 1 jam (pola sama seperti "sync-prices") - dijalankan
    // TANPA syarat (bukan cuma kalau semua provider sukses) supaya gangguan jaringan
    // di 1 provider tidak menghentikan cadence pengecekan provider lain seterusnya.
    await db.job.create({
      data: { type: "check-provider-balance", payload: {}, runAt: new Date(Date.now() + 60 * 60_000) },
    });

    return `checked=${providers.length}`;
  },

  "cleanup-rate-limits": async () => {
    const STALE_HOURS = 2;
    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60_000);
    const deleted = await db.rateLimit.deleteMany({ where: { windowStart: { lt: staleThreshold } } });
    // Self-reschedule tiap 1 jam, pola sama seperti check-provider-balance.
    await db.job.create({
      data: { type: "cleanup-rate-limits", payload: {}, runAt: new Date(Date.now() + 60 * 60_000) },
    });
    return `deleted=${deleted.count}`;
  },

  // ProviderApiLog tumbuh tiap panggilan keluar (transaksi, recheck tiap menit,
  // sync harga tiap 3 jam) dan TIDAK pernah dibaca setelah beberapa hari - tanpa
  // pembersihan, tabel forensik ini pelan-pelan jadi tabel terbesar di database.
  // 30 hari jauh lebih panjang dari umur pakainya (mendiagnosis order yang baru
  // saja gagal), tapi masih cukup untuk menelusuri keluhan pelanggan yang telat.
  "cleanup-provider-api-logs": async () => {
    const RETENTION_DAYS = 30;
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    // Dibatasi per eksekusi supaya penghapusan pertama di tabel yang sudah besar
    // tidak mengunci tabel lama-lama dan bikin request cron timeout; sisanya
    // terhapus di jadwal-jadwal berikutnya.
    const stale = await db.providerApiLog.findMany({
      where: { createdAt: { lt: threshold } },
      select: { id: true },
      take: 1000,
    });
    const deleted = stale.length
      ? await db.providerApiLog.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
      : { count: 0 };
    await db.job.create({
      data: { type: "cleanup-provider-api-logs", payload: {}, runAt: new Date(Date.now() + 6 * 60 * 60_000) },
    });
    return `deleted=${deleted.count}`;
  },

  // Meringkas PageView jadi satu baris AnalyticsDaily per hari, lalu membuang
  // baris mentah yang lebih tua dari retensi.
  //
  // Ini yang membuat statistik pengunjung tidak berubah jadi tabel terbesar di
  // database. Satu toko yang ramai bisa menghasilkan puluhan ribu baris per
  // hari, sementara yang benar-benar dibutuhkan setelah beberapa minggu cuma
  // ringkasannya. Rollup dijalankan untuk hari-hari yang SUDAH SELESAI saja -
  // meringkas hari yang masih berjalan akan menghasilkan angka yang salah dan
  // membeku di situ.
  "rollup-analytics": async () => {
    const RETENTION_DAYS = 30;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Hari yang punya data mentah tapi belum (atau belum tuntas) diringkas.
    const days = await db.$queryRaw<{ d: Date }[]>`
      SELECT DISTINCT DATE(createdAt) AS d
      FROM PageView
      WHERE createdAt < ${startOfToday}
      ORDER BY d ASC
      LIMIT 40
    `;

    let rolled = 0;
    for (const { d } of days) {
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000 - 1);

      const [pageviews, visitorRows, sessionRows, pathRows, referrerRows, deviceRows] = await Promise.all([
        db.pageView.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
        db.pageView.groupBy({ by: ["visitorHash"], where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
        db.pageView.groupBy({ by: ["sessionId"], where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
        db.pageView.groupBy({
          by: ["path"],
          where: { createdAt: { gte: dayStart, lte: dayEnd } },
          _count: true,
          orderBy: { _count: { path: "desc" } },
          take: 20,
        }),
        db.pageView.groupBy({
          by: ["referrerHost"],
          where: { createdAt: { gte: dayStart, lte: dayEnd }, referrerHost: { not: null } },
          _count: true,
          orderBy: { _count: { referrerHost: "desc" } },
          take: 15,
        }),
        db.pageView.groupBy({ by: ["device"], where: { createdAt: { gte: dayStart, lte: dayEnd } }, _count: true }),
      ]);

      const data = {
        pageviews,
        visitors: visitorRows.length,
        sessions: sessionRows.length,
        topPaths: pathRows.map((r) => ({ path: r.path, views: r._count })),
        topReferrers: referrerRows.map((r) => ({ host: r.referrerHost ?? "", views: r._count })),
        devices: deviceRows.map((r) => ({ device: r.device, views: r._count })),
        computedAt: new Date(),
      };
      // upsert, bukan create: job ini boleh jalan berkali-kali untuk hari yang
      // sama (retry, jadwal tumpang tindih) tanpa menggandakan atau gagal.
      await db.analyticsDaily.upsert({ where: { date: dayStart }, update: data, create: { date: dayStart, ...data } });
      rolled++;
    }

    // Baru dibuang SETELAH diringkas. Dibatasi per eksekusi supaya penghapusan
    // pertama di tabel besar tidak bikin request cron timeout - pola sama
    // dengan cleanup-provider-api-logs di atas.
    const pruneThreshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    const stale = await db.pageView.findMany({
      where: { createdAt: { lt: pruneThreshold } },
      select: { id: true },
      take: 2000,
    });
    const deleted = stale.length
      ? await db.pageView.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
      : { count: 0 };

    await db.job.create({
      data: { type: "rollup-analytics", payload: {}, runAt: new Date(Date.now() + 6 * 60 * 60_000) },
    });
    return `rolled=${rolled} pruned=${deleted.count}`;
  },

  "recheck-fulfillment": async (payload) => {
    const { fulfillmentId, attempt } = payload as { fulfillmentId: string; attempt: number };
    const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    if (fulfillment.status !== "SENT" && fulfillment.status !== "PROCESSING") {
      return "no-op: fulfillment sudah final";
    }

    const order = await db.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });
    const item = await db.productItem.findUniqueOrThrow({
      where: { id: order.productItemId! },
      include: { product: true },
    });
    const target = buildCustomerNo(
      item.product.inputFields as { name: string }[],
      order.target as Record<string, string>,
    );

    let result: Awaited<ReturnType<TopupProviderAdapter["checkStatus"]>>;
    try {
      // allowInactive: true - ini mengecek status transaksi yang SUDAH dikirim ke provider,
      // bukan mengirim transaksi baru. Kill-switch (isActive=false) tidak boleh memblokir
      // operasi read-only ini, kalau tidak order yang customer sudah bayar macet permanen
      // di PROCESSING karena job recheck ini gagal terus tiap kali dicoba.
      const adapter = await getAdapter(fulfillment.provider, db, { allowInactive: true });
      result = await adapter.checkStatus({
        skuCode: fulfillment.providerSkuCode,
        target,
        refId: fulfillment.ourRefId,
        context: { orderId: order.id, orderNumber: order.orderNumber, fulfillmentId: fulfillment.id },
      });
      await applyFulfillmentResult(fulfillment.id, result);
    } catch (e) {
      // Kegagalan di sini SEKARANG cuma karena masalah nyata (provider belum dikonfigurasi,
      // kredensial rusak/hilang, atau error adapter/jaringan sungguhan) - bukan kill-switch,
      // yang sudah dilewati lewat allowInactive di atas. Eskalasi langsung ke NEEDS_REVIEW alih-alih
      // membiarkan error ini menjalar ke retry/backoff generik runDueJobs, yang tidak pernah
      // sampai ke shouldEscalateRecheck dan bisa membiarkan order macet diam-diam di PROCESSING.
      console.error("recheck-fulfillment: getAdapter/checkStatus gagal, eskalasi ke NEEDS_REVIEW", {
        orderId: order.id, fulfillmentId: fulfillment.id, error: e,
      });
      const note = `Eskalasi: gagal cek status fulfillment - ${e instanceof Error ? e.message : String(e)}`;
      const escalated = await escalateOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        toStatus: "NEEDS_REVIEW",
        note,
      });
      return escalated.claimed ? "escalated: checkStatus gagal" : "no-op: order sudah final";
    }

    if (shouldEscalateRecheck(attempt, result.status)) {
      const note = "Eskalasi: 30x recheck tanpa hasil final";
      const escalated = await escalateOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        toStatus: "NEEDS_REVIEW",
        note,
      });
      return escalated.claimed ? "escalated" : "no-op: order sudah final";
    }
    if (result.status === "pending") {
      await db.job.create({
        data: {
          type: "recheck-fulfillment",
          payload: { fulfillmentId, attempt: attempt + 1 },
          runAt: new Date(Date.now() + 60_000),
        },
      });
      return `still-pending attempt=${attempt}`;
    }
    return "resolved";
  },
};

export async function ensureRecurringJobs(): Promise<void> {
  const active = await db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } });
  for (const p of active) {
    const existing = await db.job.findFirst({
      where: {
        type: "sync-prices",
        status: { in: ["PENDING", "RUNNING"] },
        payload: { equals: { provider: p.key } },
      },
    });
    if (!existing) {
      await db.job.create({ data: { type: "sync-prices", payload: { provider: p.key }, runAt: new Date() } });
    }
  }

  // Job RUNNING dianggap basi (macet/prosesnya mati) kalau sudah RUNNING lebih
  // lama dari threshold ini - jangan biarkan dia memblokir job pengganti selamanya.
  // Threshold 10 menit jauh di atas waktu normal reconcile-paid-orders selesai
  // (batch 5 order, tiap order maksimal ~15s dispatch = ~75s worst case).
  const RECONCILE_RUNNING_STALE_MINUTES = 10;
  const reconcileRunningFreshAfter = new Date(Date.now() - RECONCILE_RUNNING_STALE_MINUTES * 60_000);
  const existingReconcile = await db.job.findFirst({
    where: {
      type: "reconcile-paid-orders",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: reconcileRunningFreshAfter } },
      ],
    },
  });
  if (!existingReconcile) {
    await db.job.create({ data: { type: "reconcile-paid-orders", payload: {}, runAt: new Date() } });
  }

  // Job RUNNING dianggap basi kalau sudah RUNNING lebih lama dari threshold ini -
  // guard yang sama persis dengan reconcile-paid-orders di atas.
  const BALANCE_CHECK_RUNNING_STALE_MINUTES = 10;
  const balanceCheckRunningFreshAfter = new Date(Date.now() - BALANCE_CHECK_RUNNING_STALE_MINUTES * 60_000);
  const existingBalanceCheck = await db.job.findFirst({
    where: {
      type: "check-provider-balance",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: balanceCheckRunningFreshAfter } },
      ],
    },
  });
  if (!existingBalanceCheck) {
    await db.job.create({ data: { type: "check-provider-balance", payload: {}, runAt: new Date() } });
  }

  // Job RUNNING dianggap basi kalau sudah RUNNING lebih lama dari threshold ini -
  // guard yang sama persis dengan reconcile-paid-orders/check-provider-balance di atas.
  const CLEANUP_RATE_LIMITS_RUNNING_STALE_MINUTES = 10;
  const cleanupRateLimitsRunningFreshAfter = new Date(Date.now() - CLEANUP_RATE_LIMITS_RUNNING_STALE_MINUTES * 60_000);
  const existingCleanupRateLimits = await db.job.findFirst({
    where: {
      type: "cleanup-rate-limits",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: cleanupRateLimitsRunningFreshAfter } },
      ],
    },
  });
  if (!existingCleanupRateLimits) {
    await db.job.create({ data: { type: "cleanup-rate-limits", payload: {}, runAt: new Date() } });
  }

  // Guard basi yang sama seperti cleanup-rate-limits di atas.
  const CLEANUP_API_LOGS_RUNNING_STALE_MINUTES = 10;
  const cleanupApiLogsRunningFreshAfter = new Date(Date.now() - CLEANUP_API_LOGS_RUNNING_STALE_MINUTES * 60_000);
  const existingCleanupApiLogs = await db.job.findFirst({
    where: {
      type: "cleanup-provider-api-logs",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: cleanupApiLogsRunningFreshAfter } },
      ],
    },
  });
  if (!existingCleanupApiLogs) {
    await db.job.create({ data: { type: "cleanup-provider-api-logs", payload: {}, runAt: new Date() } });
  }

  // Guard basi yang sama seperti dua job pembersihan di atas.
  const ROLLUP_ANALYTICS_RUNNING_STALE_MINUTES = 10;
  const rollupAnalyticsRunningFreshAfter = new Date(Date.now() - ROLLUP_ANALYTICS_RUNNING_STALE_MINUTES * 60_000);
  const existingRollupAnalytics = await db.job.findFirst({
    where: {
      type: "rollup-analytics",
      OR: [
        { status: "PENDING" },
        { status: "RUNNING", updatedAt: { gt: rollupAnalyticsRunningFreshAfter } },
      ],
    },
  });
  if (!existingRollupAnalytics) {
    await db.job.create({ data: { type: "rollup-analytics", payload: {}, runAt: new Date() } });
  }
}

export async function runDueJobs(now: Date = new Date()): Promise<{ ran: number; failed: number }> {
  const due = await db.job.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: 10, // batasi per tick supaya request cron tidak timeout
  });

  let ran = 0;
  let failed = 0;

  for (const job of due) {
    // Klaim atomik: hanya satu proses yang berhasil flip PENDING→RUNNING.
    const claimed = await db.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue; // sudah diambil tick lain

    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Handler untuk job type "${job.type}" tidak terdaftar.`);
      const result = await handler(job.payload);
      await db.job.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: null, ...(result ? { payload: job.payload as object } : {}) },
      });
      ran++;
    } catch (e) {
      const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id }, select: { attempts: true, maxAttempts: true } });
      const decision = decideAfterFailure(fresh, new Date());
      await db.job.update({
        where: { id: job.id },
        data: {
          status: decision.status,
          runAt: decision.runAt,
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
      failed++;
    }
  }
  return { ran, failed };
}
