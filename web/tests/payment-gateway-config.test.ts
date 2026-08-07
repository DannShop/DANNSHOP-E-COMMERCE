import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
});

const siteSetting = { findUnique: vi.fn(), upsert: vi.fn() };
vi.mock("@/lib/db", () => ({ db: { siteSetting } }));

beforeEach(() => {
  siteSetting.findUnique.mockReset();
  siteSetting.upsert.mockReset();
  delete process.env.MIDTRANS_SERVER_KEY;
  delete process.env.MIDTRANS_IS_PRODUCTION;
});

describe("getMidtransCreds", () => {
  it("row DB ada dan valid → dipakai, bukan env", async () => {
    const { encryptJson } = await import("@/lib/crypto");
    process.env.MIDTRANS_SERVER_KEY = "env-key-tidak-boleh-dipakai";
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({ serverKey: "db-key", merchantId: "M1", isProduction: true }),
    });

    const { getMidtransCreds } = await import("@/lib/payment/gateway-config");
    const creds = await getMidtransCreds();
    expect(creds).toEqual({ serverKey: "db-key", isProduction: true });
  });

  it("row DB tidak ada → fallback ke env", async () => {
    process.env.MIDTRANS_SERVER_KEY = "env-key";
    process.env.MIDTRANS_IS_PRODUCTION = "false";
    siteSetting.findUnique.mockResolvedValue(null);

    const { getMidtransCreds } = await import("@/lib/payment/gateway-config");
    const creds = await getMidtransCreds();
    expect(creds).toEqual({ serverKey: "env-key", isProduction: false });
  });

  it("row DB korup (gagal decrypt) → fallback ke env, tidak throw", async () => {
    process.env.MIDTRANS_SERVER_KEY = "env-key";
    siteSetting.findUnique.mockResolvedValue({ value: "bukan-payload-terenkripsi-valid" });

    const { getMidtransCreds } = await import("@/lib/payment/gateway-config");
    const creds = await getMidtransCreds();
    expect(creds.serverKey).toBe("env-key");
  });

  it("row DB ada tapi serverKey kosong → fallback ke env (belum benar-benar dikonfigurasi)", async () => {
    const { encryptJson } = await import("@/lib/crypto");
    process.env.MIDTRANS_SERVER_KEY = "env-key";
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({ serverKey: "", merchantId: "", isProduction: false }),
    });

    const { getMidtransCreds } = await import("@/lib/payment/gateway-config");
    const creds = await getMidtransCreds();
    expect(creds.serverKey).toBe("env-key");
  });
});

describe("getMidtransConfigStatus", () => {
  it("tidak pernah membawa server key asli - hanya masked", async () => {
    const { encryptJson } = await import("@/lib/crypto");
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({ serverKey: "SB-Mid-server-RAHASIA1234", merchantId: "M1", isProduction: false }),
    });

    const { getMidtransConfigStatus } = await import("@/lib/payment/gateway-config");
    const status = await getMidtransConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.source).toBe("db");
    expect(status.serverKeyMasked).not.toContain("RAHASIA1234");
    expect(status.serverKeyMasked).toBe("••••1234");
  });

  it("tidak ada di DB maupun env → not configured", async () => {
    siteSetting.findUnique.mockResolvedValue(null);
    const { getMidtransConfigStatus } = await import("@/lib/payment/gateway-config");
    const status = await getMidtransConfigStatus();
    expect(status).toEqual({ configured: false, source: "none", isProduction: false, serverKeyMasked: null, merchantId: null });
  });
});
