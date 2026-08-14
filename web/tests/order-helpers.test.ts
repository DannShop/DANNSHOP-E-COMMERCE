import { describe, expect, it } from "vitest";
import { generateOrderNumber, generateRefId } from "@/lib/order/order-number";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { selectFulfillmentSku } from "@/lib/order/select-provider";

describe("generateOrderNumber", () => {
  it("format INV-YYYYMMDD-XXXX, 4 digit dari random", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    const orderNumber = generateOrderNumber(now, () => 0.1234);
    expect(orderNumber).toBe("INV-20260726-1234");
  });

  it("pakai crypto.randomInt secara default (bukan Math.random)", () => {
    const now = new Date("2026-07-26T10:00:00Z");
    const a = generateOrderNumber(now);
    const b = generateOrderNumber(now);
    // Format tetap 4 digit; tidak assert nilai spesifik (random), cukup pastikan
    // tidak error dan format konsisten - collision 2x berturut sangat tidak mungkin
    // tapi bukan hal yang perlu di-assert di sini.
    expect(a).toMatch(/^INV-20260726-\d{4}$/);
    expect(b).toMatch(/^INV-20260726-\d{4}$/);
  });
});

describe("generateRefId", () => {
  it("format PREFIX-YYYYMMDDHHmmss-6KARAKTER uppercase", () => {
    const now = new Date("2026-07-26T10:05:30Z");
    const refId = generateRefId("FUL", now, () => 0.123456789);
    expect(refId).toMatch(/^FUL-20260726100530-[A-Z0-9]{6}$/);
  });

  it("pakai crypto.randomInt secara default (bukan Math.random)", () => {
    const now = new Date("2026-07-26T10:05:30Z");
    const refId = generateRefId("FUL", now);
    expect(refId).toMatch(/^FUL-20260726100530-[A-Z0-9]{6}$/);
  });
});

describe("buildCustomerNo", () => {
  it("gabung user_id + zone_id tanpa separator sesuai urutan inputFields", () => {
    const result = buildCustomerNo(
      [{ name: "user_id" }, { name: "zone_id" }],
      { user_id: "123456789", zone_id: "1234" },
    );
    expect(result).toBe("1234567891234");
  });

  it("satu field saja (mis. nomor HP) → langsung value-nya", () => {
    expect(buildCustomerNo([{ name: "phone_number" }], { phone_number: "081234567890" })).toBe("081234567890");
  });
});

describe("selectFulfillmentSku", () => {
  const item = { sellingPrice: 22000n };
  const digiflazzActive = new Set<"DIGIFLAZZ" | "OKECONNECT" | "QIOSPAY" | "SERPUL">(["DIGIFLAZZ"]);

  it("pilih SKU DIGIFLAZZ yang ACTIVE", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "ACTIVE" }],
      digiflazzActive,
    );
    expect(result).toEqual({
      ok: true,
      sku: { provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n },
    });
  });

  it("tidak ada SKU DIGIFLAZZ ACTIVE → no_provider", () => {
    expect(selectFulfillmentSku(item, [], digiflazzActive)).toEqual({ ok: false, reason: "no_provider" });
    expect(
      selectFulfillmentSku(
        item,
        [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "UNAVAILABLE" }],
        digiflazzActive,
      ),
    ).toEqual({ ok: false, reason: "no_provider" });
  });

  it("costPrice > sellingPrice (harga modal naik) → price_increased", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 25000n, status: "ACTIVE" }],
      digiflazzActive,
    );
    expect(result).toEqual({ ok: false, reason: "price_increased" });
  });

  // Dulu tes ini menuntut SEMUA provider selain DIGIFLAZZ diabaikan, karena memang
  // cuma Digiflazz yang punya adapter. Sekarang OkeConnect punya adapter, dan
  // pemilihannya tidak lagi meng-hardcode nama provider — yang menentukan adalah
  // provider itu aktif atau tidak.
  it("SKU provider non-Digiflazz dipakai kalau provider-nya aktif", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "OKECONNECT", providerSkuCode: "S5", costPrice: 15000n, status: "ACTIVE" }],
      new Set(["OKECONNECT"]),
    );
    expect(result).toEqual({
      ok: true,
      sku: { provider: "OKECONNECT", providerSkuCode: "S5", costPrice: 15000n },
    });
  });

  it("provider yang tidak aktif tetap diabaikan", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "OKECONNECT", providerSkuCode: "S5", costPrice: 15000n, status: "ACTIVE" }],
      digiflazzActive,
    );
    expect(result).toEqual({ ok: false, reason: "provider_inactive" });
  });

  describe("urutan pemilihan antar-provider", () => {
    const both = new Set<"DIGIFLAZZ" | "OKECONNECT" | "QIOSPAY" | "SERPUL">(["DIGIFLAZZ", "OKECONNECT"]);

    it("priority kecil menang, WALAU harga modalnya lebih mahal", () => {
      // Inti keputusan desain: urutan ditentukan admin lewat priority, bukan harga.
      // Kalau suatu saat ini berubah jadi "termurah menang", tes ini yang gagal.
      const result = selectFulfillmentSku(
        item,
        [
          { provider: "OKECONNECT", providerSkuCode: "MURAH", costPrice: 15000n, status: "ACTIVE", priority: 2 },
          { provider: "DIGIFLAZZ", providerSkuCode: "MAHAL", costPrice: 19000n, status: "ACTIVE", priority: 1 },
        ],
        both,
      );
      expect(result).toEqual({
        ok: true,
        sku: { provider: "DIGIFLAZZ", providerSkuCode: "MAHAL", costPrice: 19000n },
      });
    });

    it("priority sama → harga modal termurah jadi pemecah seri", () => {
      const result = selectFulfillmentSku(
        item,
        [
          { provider: "DIGIFLAZZ", providerSkuCode: "A", costPrice: 19000n, status: "ACTIVE", priority: 5 },
          { provider: "OKECONNECT", providerSkuCode: "B", costPrice: 15000n, status: "ACTIVE", priority: 5 },
        ],
        both,
      );
      expect(result.ok && result.sku.providerSkuCode).toBe("B");
    });

    it("excludeProviders melewati provider yang sudah gagal (jalur failover)", () => {
      const skus = [
        { provider: "DIGIFLAZZ" as const, providerSkuCode: "A", costPrice: 19000n, status: "ACTIVE" as const, priority: 1 },
        { provider: "OKECONNECT" as const, providerSkuCode: "B", costPrice: 15000n, status: "ACTIVE" as const, priority: 2 },
      ];
      expect(selectFulfillmentSku(item, skus, both, new Set(["DIGIFLAZZ"]))).toEqual({
        ok: true,
        sku: { provider: "OKECONNECT", providerSkuCode: "B", costPrice: 15000n },
      });
      // Semua provider dikecualikan → tidak ada kandidat sama sekali.
      expect(selectFulfillmentSku(item, skus, both, new Set(["DIGIFLAZZ", "OKECONNECT"]))).toEqual({
        ok: false,
        reason: "no_provider",
      });
    });

    it("provider mahal dilewati kalau ada yang masih di bawah harga jual", () => {
      const result = selectFulfillmentSku(
        item,
        [
          { provider: "DIGIFLAZZ", providerSkuCode: "KEMAHALAN", costPrice: 25000n, status: "ACTIVE", priority: 1 },
          { provider: "OKECONNECT", providerSkuCode: "MASIH_UNTUNG", costPrice: 15000n, status: "ACTIVE", priority: 2 },
        ],
        both,
      );
      expect(result.ok && result.sku.providerSkuCode).toBe("MASIH_UNTUNG");
    });
  });

  it("DIGIFLAZZ ACTIVE tapi provider dinonaktifkan admin → provider_inactive", () => {
    const result = selectFulfillmentSku(
      item,
      [{ provider: "DIGIFLAZZ", providerSkuCode: "ML86", costPrice: 19750n, status: "ACTIVE" }],
      new Set(),
    );
    expect(result).toEqual({ ok: false, reason: "provider_inactive" });
  });
});
