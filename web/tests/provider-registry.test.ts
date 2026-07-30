import { beforeAll, describe, expect, it } from "vitest";
import { encryptJson } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers/registry";

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
});

function fakeDb(row: unknown) {
  return { providerConfig: { findUnique: async () => row } } as never;
}

describe("getAdapter", () => {
  it("DIGIFLAZZ dengan kredensial terenkripsi → DigiflazzAdapter", async () => {
    const row = {
      key: "DIGIFLAZZ", isActive: true,
      credentials: encryptJson({ username: "userX", apiKey: "keyY" }),
    };
    const adapter = await getAdapter("DIGIFLAZZ", fakeDb(row));
    expect(adapter.key).toBe("digiflazz");
  });

  it("config tidak ada → error jelas", async () => {
    await expect(getAdapter("DIGIFLAZZ", fakeDb(null))).rejects.toThrow(/belum dikonfigurasi/);
  });

  it("credentials kosong → error jelas", async () => {
    const row = { key: "DIGIFLAZZ", isActive: true, credentials: null };
    await expect(getAdapter("DIGIFLAZZ", fakeDb(row))).rejects.toThrow(/kredensial/i);
  });

  it("provider belum didukung → error jelas", async () => {
    const row = { key: "SERPUL", isActive: true, credentials: encryptJson({}) };
    await expect(getAdapter("SERPUL", fakeDb(row))).rejects.toThrow(/belum didukung/);
  });

  it("isActive false → error jelas (kill-switch)", async () => {
    const row = {
      key: "DIGIFLAZZ",
      isActive: false,
      credentials: encryptJson({ username: "userX", apiKey: "keyY" }),
    };
    await expect(getAdapter("DIGIFLAZZ", fakeDb(row))).rejects.toThrow(/dinonaktifkan/);
  });
});
