import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { checkRateLimit, computeWindowStart, extractIp } from "@/lib/rate-limit";

function fakeDb() {
  const rows = new Map<string, { count: number }>();
  return {
    rateLimit: {
      create: async ({ data }: { data: { key: string; count: number } }) => {
        if (rows.has(data.key)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.0.0",
          });
        }
        rows.set(data.key, { count: data.count });
        return {};
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { key: string; count: { lt: number } };
        data: { count: { increment: number } };
      }) => {
        const row = rows.get(where.key);
        if (!row || row.count >= where.count.lt) return { count: 0 };
        row.count += data.count.increment;
        return { count: 1 };
      },
    },
  };
}

describe("computeWindowStart", () => {
  it("membulatkan ke bawah kelipatan windowMs", () => {
    const now = new Date("2026-07-30T10:03:27.000Z");
    expect(computeWindowStart(now, 60_000).toISOString()).toBe("2026-07-30T10:03:00.000Z");
  });
});

describe("extractIp", () => {
  it("ambil IP TERAKHIR dari x-forwarded-for (hop reverse proxy terdekat, bukan klaim caller)", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(extractIp(headers)).toBe("5.6.7.8");
  });

  it("header kosong → \"unknown\"", () => {
    expect(extractIp(new Headers())).toBe("unknown");
  });
});

describe("checkRateLimit", () => {
  it("request pertama di window → allowed", async () => {
    const dbClient = fakeDb();
    const now = new Date("2026-07-30T10:00:00.000Z");
    const result = await checkRateLimit("login:ip:1.2.3.4", 3, 60_000, now, dbClient as never);
    expect(result).toEqual({ allowed: true });
  });

  it("request di bawah limit dalam window sama → allowed", async () => {
    const dbClient = fakeDb();
    await checkRateLimit("login:ip:1.2.3.4", 3, 60_000, new Date("2026-07-30T10:00:00.000Z"), dbClient as never);
    const second = await checkRateLimit(
      "login:ip:1.2.3.4",
      3,
      60_000,
      new Date("2026-07-30T10:00:10.000Z"),
      dbClient as never,
    );
    expect(second).toEqual({ allowed: true });
  });

  it("request melewati limit di window sama → denied dengan retryAfterMs", async () => {
    const dbClient = fakeDb();
    await checkRateLimit("login:ip:1.2.3.4", 2, 60_000, new Date("2026-07-30T10:00:00.000Z"), dbClient as never);
    await checkRateLimit("login:ip:1.2.3.4", 2, 60_000, new Date("2026-07-30T10:00:10.000Z"), dbClient as never);
    const third = await checkRateLimit(
      "login:ip:1.2.3.4",
      2,
      60_000,
      new Date("2026-07-30T10:00:20.000Z"),
      dbClient as never,
    );
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBe(40_000);
  });

  it("window baru → limit reset, allowed lagi", async () => {
    const dbClient = fakeDb();
    await checkRateLimit("login:ip:1.2.3.4", 1, 60_000, new Date("2026-07-30T10:00:00.000Z"), dbClient as never);
    const deniedSameWindow = await checkRateLimit(
      "login:ip:1.2.3.4",
      1,
      60_000,
      new Date("2026-07-30T10:00:30.000Z"),
      dbClient as never,
    );
    expect(deniedSameWindow.allowed).toBe(false);
    const nextWindow = await checkRateLimit(
      "login:ip:1.2.3.4",
      1,
      60_000,
      new Date("2026-07-30T10:01:05.000Z"),
      dbClient as never,
    );
    expect(nextWindow.allowed).toBe(true);
  });

  it("error DB selain unique-constraint → fail-open (allowed)", async () => {
    const dbClient = {
      rateLimit: {
        create: async () => {
          throw new Error("connection refused");
        },
        updateMany: async () => ({ count: 0 }),
      },
    };
    const result = await checkRateLimit("login:ip:1.2.3.4", 1, 60_000, new Date(), dbClient as never);
    expect(result.allowed).toBe(true);
  });

  it("error pada updateMany race path → fail-open (allowed)", async () => {
    const dbClient = {
      rateLimit: {
        create: async ({ data }: { data: { key: string; count: number } }) => {
          // Simulasi race: throw P2002 untuk trigger path updateMany
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "6.0.0",
          });
        },
        updateMany: async () => {
          // updateMany throws error (DB connection problem, timeout, etc)
          throw new Error("connection refused on updateMany");
        },
      },
    };
    const result = await checkRateLimit("login:ip:1.2.3.4", 1, 60_000, new Date(), dbClient as never);
    expect(result.allowed).toBe(true);
  });
});
