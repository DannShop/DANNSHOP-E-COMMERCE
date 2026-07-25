import { describe, expect, it } from "vitest";
import { isItemPurchasable } from "@/lib/catalog/public";

describe("isItemPurchasable", () => {
  it("true kalau ada ProviderSku DIGIFLAZZ berstatus ACTIVE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "ACTIVE" }])).toBe(true);
  });

  it("false kalau DIGIFLAZZ ada tapi UNAVAILABLE", () => {
    expect(isItemPurchasable([{ provider: "DIGIFLAZZ", status: "UNAVAILABLE" }])).toBe(false);
  });

  it("false kalau tidak ada mapping DIGIFLAZZ sama sekali", () => {
    expect(isItemPurchasable([])).toBe(false);
    expect(isItemPurchasable([{ provider: "OKECONNECT", status: "ACTIVE" } as never])).toBe(false);
  });
});
