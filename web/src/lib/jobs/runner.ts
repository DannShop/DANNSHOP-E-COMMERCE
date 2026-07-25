import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";
import { applyFulfillmentResult, dispatchFulfillment } from "@/lib/order/fulfillment";
import { getAdapter } from "@/lib/providers/registry";
import { buildCustomerNo } from "@/lib/order/customer-no";

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

  "reconcile-paid-orders": async () => {
    const STALE_MINUTES = 5;
    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60_000);
    const staleOrders = await db.order.findMany({
      where: { status: "PAID", updatedAt: { lte: staleThreshold } },
      select: { id: true },
      take: 20,
    });
    for (const order of staleOrders) {
      await dispatchFulfillment(order.id);
    }
    return `reconciled=${staleOrders.length}`;
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

    const adapter = await getAdapter(fulfillment.provider);
    const result = await adapter.checkStatus({
      skuCode: fulfillment.providerSkuCode,
      target,
      refId: fulfillment.ourRefId,
    });
    await applyFulfillmentResult(fulfillment.id, result);

    if (shouldEscalateRecheck(attempt, result.status)) {
      await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "NEEDS_REVIEW", note: "Eskalasi: 30x recheck tanpa hasil final" },
      });
      return "escalated";
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

  const existingReconcile = await db.job.findFirst({
    where: { type: "reconcile-paid-orders", status: { in: ["PENDING", "RUNNING"] } },
  });
  if (!existingReconcile) {
    await db.job.create({ data: { type: "reconcile-paid-orders", payload: {}, runAt: new Date() } });
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
