import { beforeEach, describe, expect, it, vi } from "vitest";

const siteSetting = { findUnique: vi.fn(), upsert: vi.fn() };
vi.mock("@/lib/db", () => ({ db: { siteSetting } }));

beforeEach(() => {
  siteSetting.findUnique.mockReset();
  siteSetting.upsert.mockReset();
});

describe("getPaymentRules", () => {
  it("belum pernah disimpan → default (perilaku lama: kode unik & fee aktif di order+deposit, range 1-999)", async () => {
    siteSetting.findUnique.mockResolvedValue(null);
    const { getPaymentRules, DEFAULT_PAYMENT_RULES } = await import("@/lib/payment/rules");
    expect(await getPaymentRules()).toEqual(DEFAULT_PAYMENT_RULES);
  });

  it("row tersimpan valid → dipakai apa adanya", async () => {
    siteSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({
        uniqueCodeOrder: false,
        uniqueCodeDeposit: true,
        feeOrder: true,
        feeDeposit: false,
        uniqueCodeMin: 100,
        uniqueCodeMax: 500,
      }),
    });
    const { getPaymentRules } = await import("@/lib/payment/rules");
    const rules = await getPaymentRules();
    expect(rules.uniqueCodeOrder).toBe(false);
    expect(rules.uniqueCodeMin).toBe(100);
    expect(rules.uniqueCodeMax).toBe(500);
  });

  it("JSON korup → fallback default, tidak throw (checkout tidak boleh mati)", async () => {
    siteSetting.findUnique.mockResolvedValue({ value: "{bukan json valid" });
    const { getPaymentRules, DEFAULT_PAYMENT_RULES } = await import("@/lib/payment/rules");
    expect(await getPaymentRules()).toEqual(DEFAULT_PAYMENT_RULES);
  });

  it("bentuk lama/tidak lengkap → fallback default", async () => {
    siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ foo: "bar" }) });
    const { getPaymentRules, DEFAULT_PAYMENT_RULES } = await import("@/lib/payment/rules");
    expect(await getPaymentRules()).toEqual(DEFAULT_PAYMENT_RULES);
  });
});

describe("savePaymentRules", () => {
  it("upsert dengan key payment_rules", async () => {
    const { savePaymentRules, DEFAULT_PAYMENT_RULES } = await import("@/lib/payment/rules");
    await savePaymentRules(DEFAULT_PAYMENT_RULES);
    expect(siteSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "payment_rules" } }),
    );
  });
});
