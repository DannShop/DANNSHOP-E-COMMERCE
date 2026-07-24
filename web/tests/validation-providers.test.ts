import { describe, expect, it } from "vitest";
import { digiflazzCredentialsSchema, testTransactionSchema } from "@/app/actions/providers";

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
