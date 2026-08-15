import { describe, expect, it } from "vitest";
import type { ProviderKey } from "@prisma/client";
import { isItemPurchasable } from "@/lib/catalog/public";

// Gerbang ini WAJIB sejalan dengan selectFulfillmentSku di lib/order/select-provider.ts.
// Keduanya menjawab pertanyaan yang sama ("item ini bisa dikirim atau tidak"), cuma di
// dua waktu berbeda: yang ini saat katalog digambar, yang itu saat order dikirim.
//
// Dulu keduanya SEMPAT berbeda dan itu bukan perbedaan yang aman: selectFulfillmentSku
// sudah provider-agnostic, sementara di sini masih ada `s.provider === "DIGIFLAZZ"`
// yang tertinggal. Akibatnya item yang cuma dipetakan ke OkeConnect ditolak tampil
// sebagai bisa dibeli, padahal jalur pengirimannya sudah siap menerimanya.
describe("isItemPurchasable", () => {
  const active = (...keys: ProviderKey[]) => new Set<ProviderKey>(keys);

  it("true kalau ada SKU ACTIVE dari provider yang aktif — Digiflazz", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }], active("DIGIFLAZZ"))).toBe(true);
  });

  it("true kalau ada SKU ACTIVE dari provider yang aktif — OkeConnect", () => {
    // Inti perbaikannya. Sebelumnya kasus ini dikunci `false` oleh tes lama.
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "ACTIVE" }], active("OKECONNECT"))).toBe(true);
  });

  it("provider mana pun yang aktif sudah cukup — tidak harus Digiflazz", () => {
    expect(
      isItemPurchasable(
        [{ provider: "OKECONNECT", status: "ACTIVE" }],
        active("DIGIFLAZZ", "OKECONNECT"),
      ),
    ).toBe(true);
  });

  it("false kalau SKU-nya ada tapi UNAVAILABLE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "UNAVAILABLE" }], active("DIGIFLAZZ"))).toBe(false);
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "UNAVAILABLE" }], active("OKECONNECT"))).toBe(false);
  });

  it("false kalau tidak ada mapping sama sekali", () => {
    expect(isItemPurchasable([], active("DIGIFLAZZ", "OKECONNECT"))).toBe(false);
  });

  it("false kalau SKU ACTIVE tapi providernya dimatikan admin (kill-switch)", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }], active())).toBe(false);
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "ACTIVE" }], active("DIGIFLAZZ"))).toBe(false);
  });

  it("satu provider mati, satu hidup → tetap bisa dibeli lewat yang hidup", () => {
    expect(
      isItemPurchasable(
        [
          { provider: "DIGIFLAZZ", status: "ACTIVE" },
          { provider: "OKECONNECT", status: "ACTIVE" },
        ],
        active("OKECONNECT"),
      ),
    ).toBe(true);
  });

  it("produk MANUAL selalu bisa dibeli — memang tidak punya SKU provider", () => {
    expect(isItemPurchasable([], active(), "MANUAL")).toBe(true);
  });
});
