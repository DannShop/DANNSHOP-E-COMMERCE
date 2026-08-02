import { describe, expect, it, vi } from "vitest";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomInt: vi.fn((min: number, max: number) => {
      return actual.randomInt(min, max);
    }),
  };
});

describe("calculateFee", () => {
  it("fee flat saja (feePercent 0)", () => {
    expect(calculateFee(22000n, 4000n, 0)).toBe(4000n);
  });

  it("fee persen saja (basis point, feeFlat 0)", () => {
    // 22000 * 70bp (0.70%) = 154
    expect(calculateFee(22000n, 0n, 70)).toBe(154n);
  });

  it("gabungan flat + persen", () => {
    expect(calculateFee(100_000n, 1000n, 100)).toBe(2000n); // 1000 + (100000*1%=1000)
  });

  it("basis point dibulatkan ke bawah (integer division)", () => {
    // 999 * 75bp (0.75%) = 7.4925 -> 7
    expect(calculateFee(999n, 0n, 75)).toBe(7n);
  });
});

describe("generateUniqueCode", () => {
  it("selalu antara 1 dan 999 inklusif", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateUniqueCode();
      expect(code).toBeGreaterThanOrEqual(1);
      expect(code).toBeLessThanOrEqual(999);
    }
  });

  it("pakai crypto.randomInt, bukan Math.random", async () => {
    const crypto = await import("node:crypto");
    generateUniqueCode();
    expect(crypto.randomInt).toHaveBeenCalledWith(1, 1000);
  });
});

describe("calculateTotal", () => {
  it("menjumlahkan base + fee + kode unik", () => {
    expect(calculateTotal(22000n, 4000n, 237)).toBe(26237n);
  });

  it("kode unik 0 (mis. bayar saldo) tidak menambah apa-apa", () => {
    expect(calculateTotal(22000n, 0n, 0)).toBe(22000n);
  });
});
