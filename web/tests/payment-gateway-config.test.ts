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
    expect(status).toEqual({
      configured: false,
      source: "none",
      isProduction: false,
      serverKeyMasked: null,
      merchantId: null,
      integrationMode: "core_api",
      clientKey: "",
    });
  });
});

describe("mode integrasi (Core API vs Snap)", () => {
  it("konfigurasi lama tanpa field integrationMode dibaca sebagai core_api", async () => {
    // Row yang tersimpan SEBELUM fitur Snap ada tidak punya integrationMode
    // maupun clientKey. Kalau normalisasinya lupa, mode-nya jadi undefined dan
    // createPaymentActions diam-diam masuk cabang yang salah.
    const { encryptJson } = await import("@/lib/crypto");
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({ serverKey: "db-key", merchantId: "M1", isProduction: true }),
    });

    const { getMidtransRuntime } = await import("@/lib/payment/gateway-config");
    const runtime = await getMidtransRuntime();
    expect(runtime.mode).toBe("core_api");
    expect(runtime.clientKey).toBe("");
    expect(runtime.creds).toEqual({ serverKey: "db-key", isProduction: true });
  });

  it("mode snap terbaca beserta client key-nya", async () => {
    const { encryptJson } = await import("@/lib/crypto");
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({
        serverKey: "db-key",
        clientKey: "Mid-client-abc",
        merchantId: "M1",
        isProduction: true,
        integrationMode: "snap",
      }),
    });

    const { getMidtransRuntime } = await import("@/lib/payment/gateway-config");
    const runtime = await getMidtransRuntime();
    expect(runtime.mode).toBe("snap");
    expect(runtime.clientKey).toBe("Mid-client-abc");
  });

  it("getSnapBrowserConfig memilih host Snap.js sesuai environment", async () => {
    const { encryptJson } = await import("@/lib/crypto");
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({
        serverKey: "db-key",
        clientKey: "Mid-client-abc",
        merchantId: "",
        isProduction: true,
        integrationMode: "snap",
      }),
    });

    const { getSnapBrowserConfig } = await import("@/lib/payment/gateway-config");
    const snap = await getSnapBrowserConfig();
    expect(snap).toEqual({
      clientKey: "Mid-client-abc",
      scriptUrl: "https://app.midtrans.com/snap/snap.js",
    });
  });

  it("tanpa client key, getSnapBrowserConfig null - popup mustahil jalan", async () => {
    const { encryptJson } = await import("@/lib/crypto");
    siteSetting.findUnique.mockResolvedValue({
      value: encryptJson({ serverKey: "db-key", merchantId: "", isProduction: false, integrationMode: "snap" }),
    });

    const { getSnapBrowserConfig } = await import("@/lib/payment/gateway-config");
    expect(await getSnapBrowserConfig()).toBeNull();
  });
});
