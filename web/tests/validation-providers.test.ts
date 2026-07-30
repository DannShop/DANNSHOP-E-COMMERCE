import { describe, expect, it } from "vitest";
import { balanceThresholdSchema, digiflazzCredentialsSchema, testTransactionSchema } from "@/app/actions/providers";

describe("digiflazzCredentialsSchema", () => {
  it("username + apiKey wajib, webhookSecret opsional", () => {
    expect(digiflazzCredentialsSchema.safeParse({ username: "u", apiKey: "k" }).success).toBe(true);
    expect(
      digiflazzCredentialsSchema.safeParse({ username: "u", apiKey: "k", webhookSecret: "s" }).success,
    ).toBe(true);
  });

  it("field kosong ditolak dengan pesan Indonesia", () => {
    const r = digiflazzCredentialsSchema.safeParse({ username: "", apiKey: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/wajib/i);
  });

  it("webhookSecret string kosong dinormalisasi jadi undefined", () => {
    const r = digiflazzCredentialsSchema.parse({ username: "u", apiKey: "k", webhookSecret: "" });
    expect(r.webhookSecret).toBeUndefined();
  });
});

describe("testTransactionSchema", () => {
  it("skuCode + target wajib; testing default true", () => {
    const r = testTransactionSchema.parse({ skuCode: "ML86", target: "123456789" });
    expect(r.testing).toBe(true);
  });

  it("field kosong ditolak", () => {
    expect(testTransactionSchema.safeParse({ skuCode: "", target: "" }).success).toBe(false);
  });
});

describe("balanceThresholdSchema", () => {
  it("angka valid diterima, dikonversi ke bigint", () => {
    const r = balanceThresholdSchema.parse({ minBalanceAlert: "1000000" });
    expect(r.minBalanceAlert).toBe(1_000_000n);
  });

  it("string kosong dinormalisasi jadi null (alert dinonaktifkan)", () => {
    const r = balanceThresholdSchema.parse({ minBalanceAlert: "" });
    expect(r.minBalanceAlert).toBeNull();
  });

  it("null diterima apa adanya (alert dinonaktifkan)", () => {
    const r = balanceThresholdSchema.parse({ minBalanceAlert: null });
    expect(r.minBalanceAlert).toBeNull();
  });

  it("bukan angka ditolak dengan pesan Indonesia", () => {
    const r = balanceThresholdSchema.safeParse({ minBalanceAlert: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Ambang batas harus berupa angka");
  });

  it("angka negatif ditolak", () => {
    const r = balanceThresholdSchema.safeParse({ minBalanceAlert: "-1000" });
    expect(r.success).toBe(false);
  });
});
