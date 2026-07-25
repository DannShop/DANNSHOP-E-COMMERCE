import { describe, expect, it } from "vitest";
import { depositSchema, MIN_DEPOSIT, MAX_DEPOSIT } from "@/lib/validation/deposit";

describe("depositSchema", () => {
  it("nominal preset valid (mis. 50000) lolos", () => {
    expect(depositSchema.safeParse({ amount: "50000" }).success).toBe(true);
  });

  it("di bawah minimum ditolak", () => {
    const result = depositSchema.safeParse({ amount: String(MIN_DEPOSIT - 1n) });
    expect(result.success).toBe(false);
  });

  it("di atas maksimum ditolak", () => {
    const result = depositSchema.safeParse({ amount: String(MAX_DEPOSIT + 1n) });
    expect(result.success).toBe(false);
  });

  it("tepat di batas min/max lolos", () => {
    expect(depositSchema.safeParse({ amount: String(MIN_DEPOSIT) }).success).toBe(true);
    expect(depositSchema.safeParse({ amount: String(MAX_DEPOSIT) }).success).toBe(true);
  });

  it("bukan angka ditolak, pesan Bahasa Indonesia", () => {
    const result = depositSchema.safeParse({ amount: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Nominal harus berupa angka");
  });
});
