import { describe, expect, it } from "vitest";
import { dedupePriceList, diffPriceList, type CurrentSku } from "@/lib/catalog/price-sync";
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

// Kasus NYATA, bukan karangan: price list OkeConnect (8.153 baris, diambil
// 2026-08-15) memuat tiga kode yang muncul DUA KALI — LISTONLY, CEKHONLY, dan
// BYRHONLY — masing-masing sekali di bawah produk "Indosat Only 4U Baru" dan
// sekali di bawah "Indosat Only 4U Nonaktif". Nilai `kode`-nya identik.
//
// ProviderPriceListCache punya @@unique([provider, skuCode]), jadi createMany
// atas daftar mentah itu menabrak unique constraint, SELURUH $transaction
// runPriceSync ikut rollback, dan sync harga gagal 100% — bukan sesekali.
// Digiflazz tidak pernah kena karena buyer_sku_code mereka unik.
describe("dedupePriceList", () => {
  it("kode ganda diciutkan jadi satu baris", () => {
    const out = dedupePriceList([
      fetchedRow({ skuCode: "LISTONLY", brand: "Indosat Only 4U Baru", costPrice: 999n }),
      fetchedRow({ skuCode: "LISTONLY", brand: "Indosat Only 4U Nonaktif", costPrice: 999n }),
      fetchedRow({ skuCode: "ML86" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.skuCode)).toEqual(["LISTONLY", "ML86"]);
  });

  it("harga modal berbeda → yang TERMAHAL yang menang", () => {
    // Arah yang dipilih menentukan uang: guard anti-jual-rugi di
    // selectFulfillmentSku membandingkan costPrice dengan harga jual, jadi
    // meremehkan modal berarti melepas SKU yang dijual di bawah modal.
    const out = dedupePriceList([
      fetchedRow({ skuCode: "DUP", costPrice: 1000n }),
      fetchedRow({ skuCode: "DUP", costPrice: 1500n }),
      fetchedRow({ skuCode: "DUP", costPrice: 1200n }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].costPrice).toBe(1500n);
  });

  it("salah satu kembaran tidak tersedia → hasilnya ikut tidak tersedia", () => {
    // Sejalan dengan sikap yang sudah dipakai okeconnect-parse.ts: menahan diri
    // selalu bisa diperbaiki, salah memutuskan tidak. Menandai ACTIVE padahal
    // salah satu varian mati akan mengirim order ke SKU yang pasti gagal.
    const out = dedupePriceList([
      fetchedRow({ skuCode: "DUP", available: true }),
      fetchedRow({ skuCode: "DUP", available: false }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].available).toBe(false);
  });

  it("harga & ketersediaan hasilnya tidak bergantung urutan baris dari provider", () => {
    const rows = [
      fetchedRow({ skuCode: "DUP", costPrice: 1000n, available: false }),
      fetchedRow({ skuCode: "DUP", costPrice: 1500n, available: true }),
    ];
    expect(dedupePriceList(rows)).toEqual(dedupePriceList([...rows].reverse()));
  });

  it("daftar tanpa kode ganda dikembalikan apa adanya", () => {
    const rows = [fetchedRow({ skuCode: "A" }), fetchedRow({ skuCode: "B" })];
    expect(dedupePriceList(rows)).toEqual(rows);
  });
});
