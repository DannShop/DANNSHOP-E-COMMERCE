import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";

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
