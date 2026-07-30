import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
}

type DbLike = {
  rateLimit: {
    create: (args: { data: { key: string; windowStart: Date; count: number } }) => Promise<unknown>;
    updateMany: (args: {
      where: { key: string; count: { lt: number } };
      data: { count: { increment: number } };
    }) => Promise<{ count: number }>;
  };
};

export function computeWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export function extractIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// Fixed-window rate limiter berbasis tabel RateLimit (bukan in-memory) supaya
// tidak "reset" begitu proses Node restart (deploy/crash/PM2 respawn di
// shared hosting) - spec Fase 7c §H-1.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
  dbClient: DbLike = db as unknown as DbLike,
): Promise<RateLimitResult> {
  const windowStart = computeWindowStart(now, windowMs);
  const fullKey = `${key}:${windowStart.getTime()}`;
  const retryAfterMs = windowStart.getTime() + windowMs - now.getTime();

  try {
    await dbClient.rateLimit.create({ data: { key: fullKey, windowStart, count: 1 } });
    return { allowed: true };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
      // DB error selain race unique-constraint - fail-open, jangan sampai
      // DB bermasalah mengunci seluruh app (spec §6).
      console.error("checkRateLimit: gagal cek limit, fail-open", { key, error: e });
      return { allowed: true };
    }
    // race: request lain di window sama barusan insert row-nya duluan - lanjut ke klaim atomik di bawah
  }

  const claimed = await dbClient.rateLimit.updateMany({
    where: { key: fullKey, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  if (claimed.count === 0) return { allowed: false, retryAfterMs };
  return { allowed: true };
}
