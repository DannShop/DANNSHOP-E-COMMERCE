import { describe, expect, it } from "vitest";
import { diffPriceList, type CurrentSku } from "@/lib/catalog/price-sync";
import type { ProviderSkuPrice } from "@/lib/providers/types";

const fetchedRow = (over: Partial<ProviderSkuPrice>): ProviderSkuPrice => ({
  skuCode: "ML86", productName: "86 Diamonds", category: "Games",
  brand: "MOBILE LEGENDS", costPrice: 19750n, available: true, ...over,
});

describe("diffPriceList", () => {
  const current: CurrentSku[] = [
    { id: "1", providerSkuCode: "ML86", costPrice: 19000n, status: "ACTIVE" },
    { id: "2", providerSkuCode: "FF100", costPrice: 14000n, status: "ACTIVE" },
    { id: "3", providerSkuCode: "HILANG1", costPrice: 5000n, status: "ACTIVE" },
  ];

  it("harga berubah → update costPrice; SKU hilang → UNAVAILABLE", () => {
    const fetched = [
      fetchedRow({ skuCode: "ML86", costPrice: 19750n }),
      fetchedRow({ skuCode: "FF100", costPrice: 14000n }),
      // HILANG1 tidak ada di price list
    ];
    const { updates, missingCount } = diffPriceList(current, fetched);

    expect(updates).toContainEqual({ id: "1", costPrice: 19750n, status: "ACTIVE" });
    expect(updates).toContainEqual({ id: "3", costPrice: 5000n, status: "UNAVAILABLE" });
    expect(missingCount).toBe(1);
  });

  it("available=false di provider → UNAVAILABLE walau masih di list", () => {
    const fetched = [fetchedRow({ skuCode: "ML86", available: false })];
    const { updates } = diffPriceList([current[0]], fetched);
    expect(updates).toContainEqual({ id: "1", costPrice: 19750n, status: "UNAVAILABLE" });
  });

  it("SKU yang tadinya UNAVAILABLE dan muncul lagi → kembali ACTIVE", () => {
    const cur: CurrentSku[] = [{ id: "9", providerSkuCode: "ML86", costPrice: 19750n, status: "UNAVAILABLE" }];
    const { updates } = diffPriceList(cur, [fetchedRow({})]);
    expect(updates).toContainEqual({ id: "9", costPrice: 19750n, status: "ACTIVE" });
  });

  it("tidak ada perubahan → tetap masuk updates dengan nilai sama (lastSyncedAt tetap maju)", () => {
    const { updates } = diffPriceList([current[1]], [fetchedRow({ skuCode: "FF100", costPrice: 14000n })]);
    expect(updates).toHaveLength(1);
  });
});
