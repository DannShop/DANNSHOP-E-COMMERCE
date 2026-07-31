import { beforeAll, describe, expect, it } from "vitest";
import { encryptJson, decryptJson, safeCompare } from "@/lib/crypto";

beforeAll(() => {
  // key 32 byte (64 hex char) khusus test
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
});

describe("crypto kredensial", () => {
  it("encrypt lalu decrypt kembali sama", () => {
    const creds = { username: "wildan", apiKey: "rahasia-123" };
    const enc = encryptJson(creds);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("rahasia-123");
    expect(decryptJson(enc)).toEqual(creds);
  });

  it("dua kali encrypt menghasilkan ciphertext berbeda (IV acak)", () => {
    const a = encryptJson({ x: 1 });
    const b = encryptJson({ x: 1 });
    expect(a).not.toBe(b);
  });

  it("payload yang diubah ditolak (GCM auth tag)", () => {
    const enc = encryptJson({ x: 1 });
    const parts = enc.split(":");
    parts[3] = Buffer.from("berubah!").toString("base64");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });

  it("key env belum di-set → error jelas", () => {
    const saved = process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptJson({ x: 1 })).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved;
  });
});

describe("safeCompare", () => {
  it("dua string sama persis → true", () => {
    expect(safeCompare("rahasia123", "rahasia123")).toBe(true);
  });

  it("string beda isi tapi panjang sama → false", () => {
    expect(safeCompare("rahasia123", "rahasiaXXX")).toBe(false);
  });

  it("string beda panjang → false (tidak throw)", () => {
    expect(safeCompare("pendek", "jauh-lebih-panjang-dari-ini")).toBe(false);
  });

  it("dua string kosong → true", () => {
    expect(safeCompare("", "")).toBe(true);
  });
});
