import { describe, expect, it } from "vitest";
import { isItemPurchasable } from "@/lib/catalog/public";

describe("isItemPurchasable", () => {
  const digiflazzActive = new Set<"DIGIFLAZZ" | "OKECONNECT" | "QIOSPAY" | "SERPUL">(["DIGIFLAZZ"]);

  it("true kalau ada ProviderSku DIGIFLAZZ berstatus ACTIVE dan provider aktif", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }], digiflazzActive)).toBe(true);
  });

  it("false kalau DIGIFLAZZ ada tapi UNAVAILABLE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "UNAVAILABLE" }], digiflazzActive)).toBe(false);
  });

  it("false kalau tidak ada mapping DIGIFLAZZ sama sekali", () => {
    expect(isItemPurchasable([], digiflazzActive)).toBe(false);
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "ACTIVE" } as never], digiflazzActive)).toBe(false);
  });

  it("false kalau ProviderSku ACTIVE tapi provider dinonaktifkan admin (kill-switch)", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }], new Set())).toBe(false);
  });
});
