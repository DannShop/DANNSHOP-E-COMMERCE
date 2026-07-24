import { describe, expect, it } from "vitest";
import { computeBackoff, decideAfterFailure } from "@/lib/jobs/runner";

describe("computeBackoff", () => {
  it("eskalasi 1, 5, 15, 60, 180 menit lalu mentok di 180", () => {
    expect(computeBackoff(1)).toBe(1);
    expect(computeBackoff(2)).toBe(5);
    expect(computeBackoff(3)).toBe(15);
    expect(computeBackoff(4)).toBe(60);
    expect(computeBackoff(5)).toBe(180);
    expect(computeBackoff(99)).toBe(180);
  });
});

describe("decideAfterFailure", () => {
  it("attempts masih di bawah max → retry PENDING dengan runAt mundur sesuai backoff", () => {
    const now = new Date("2026-07-24T10:00:00Z");
    const d = decideAfterFailure({ attempts: 1, maxAttempts: 5 }, now);
    expect(d.status).toBe("PENDING");
    expect(d.runAt.getTime()).toBe(now.getTime() + 1 * 60_000);
  });

  it("attempts mencapai max → FAILED permanen", () => {
    const d = decideAfterFailure({ attempts: 5, maxAttempts: 5 }, new Date());
    expect(d.status).toBe("FAILED");
  });
});
