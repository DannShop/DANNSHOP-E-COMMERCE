import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";
import { applyFulfillmentResult, dispatchFulfillment, escalateOrder } from "@/lib/order/fulfillment";
import { getAdapter } from "@/lib/providers/registry";
import type { TopupProviderAdapter } from "@/lib/providers/types";
import { decideBalanceAlertTransition } from "@/lib/providers/balance-alert";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { formatBalanceAlertMessage, sendTelegramAlert } from "@/lib/notify/telegram";

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
    return `updated=${result.updated} missing=${result.missing}`;
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

      const transition = decideBalanceAlertTransition(balance, provider.minBalanceAlert!, provider.balanceAlertStatus);
      if (transition.alert !== "none") {
        // Kirim dulu, baru persist transisi status - KALAU sukses terkirim.
        // Kalau kirim gagal (jaringan/token salah), status DB TIDAK diubah supaya
        // siklus job berikutnya (1 jam lagi) otomatis mencoba ulang alert yang sama
        // (state machine mengevaluasi ulang dari status lama, konsisten).
        const sent = await sendTelegramAlert(
          formatBalanceAlertMessage({
            displayName: provider.displayName,
            balance,
            threshold: provider.minBalanceAlert!,
            recovered: transition.alert === "recovered",
          }),
        );
        if (sent) {
          // CAS: cuma tulis kalau status belum diubah proses lain sejak dibaca -
          // menutup race yang sangat jarang antar-invocation job yang tumpang tindih.
          await db.providerConfig.updateMany({
            where: { key: provider.key, balanceAlertStatus: provider.balanceAlertStatus },
            data: { balanceAlertStatus: transition.newStatus },
          });
        }
      }
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
