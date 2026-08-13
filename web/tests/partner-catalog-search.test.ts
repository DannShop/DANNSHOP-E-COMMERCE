import { describe, expect, it } from "vitest";
import { narrowItems } from "@/lib/partner/price-list";

/**
 * Aturan penyempitan item saat mencari di katalog mitra.
 *
 * Terlihat sepele tapi punya satu jebakan yang mematikan hasil pencarian:
 * klausa `where` di database memilih PRODUK (termasuk lewat nama itemnya), jadi
 * kalau item disaring dengan kata kunci yang sama secara membabi buta, mencari
 * "mobile legends" akan mengembalikan produknya dengan NOL item — karena tidak
 * ada satu pun nominal yang bernama "mobile legends".
 */
const PRODUCT = {
  name: "Mobile Legends",
  publisher: "Moonton",
  slug: "mobile-legends",
  items: [
    { id: "itm_86", name: "86 Diamond" },
    { id: "itm_172", name: "172 Diamond" },
    { id: "itm_wp", name: "Weekly Pass" },
  ],
};

describe("narrowItems", () => {
  it("tanpa pencarian, semua item dikembalikan apa adanya", () => {
    expect(narrowItems(PRODUCT, "", "")).toHaveLength(3);
  });

  // Inti jebakannya.
  it("nama PRODUK yang cocok tetap menampilkan SELURUH item", () => {
    expect(narrowItems(PRODUCT, "mobile legends", "mobile legends")).toHaveLength(3);
  });

  it("publisher yang cocok juga menampilkan seluruh item", () => {
    expect(narrowItems(PRODUCT, "moonton", "moonton")).toHaveLength(3);
  });

  it("slug yang cocok juga menampilkan seluruh item", () => {
    expect(narrowItems(PRODUCT, "mobile-legends", "mobile-legends")).toHaveLength(3);
  });

  it("kata kunci yang hanya cocok ke NAMA ITEM menyempitkan ke item itu saja", () => {
    const result = narrowItems(PRODUCT, "weekly", "weekly");
    expect(result.map((i) => i.id)).toEqual(["itm_wp"]);
  });

  it("cocok sebagian pada beberapa item mengembalikan semuanya yang cocok", () => {
    const result = narrowItems(PRODUCT, "diamond", "diamond");
    expect(result.map((i) => i.id)).toEqual(["itm_86", "itm_172"]);
  });

  // Mitra yang mendiagnosis rc 14 datang membawa SKU dari log, bukan nama produk.
  it("SKU persis menyempitkan ke satu item", () => {
    const result = narrowItems(PRODUCT, "itm_172", "itm_172");
    expect(result.map((i) => i.id)).toEqual(["itm_172"]);
  });

  it("pencarian tidak peduli huruf besar/kecil", () => {
    expect(narrowItems(PRODUCT, "weekly pass", "Weekly Pass").map((i) => i.id)).toEqual(["itm_wp"]);
  });

  // Jaring pengaman: kartu produk kosong lebih membingungkan daripada berguna.
  it("kalau tidak ada item yang tersisa, kembalikan semuanya daripada kartu kosong", () => {
    expect(narrowItems(PRODUCT, "tidak-ada-sama-sekali", "tidak-ada-sama-sekali")).toHaveLength(3);
  });

  it("aman untuk produk tanpa publisher", () => {
    const noPublisher = { ...PRODUCT, publisher: null };
    expect(narrowItems(noPublisher, "weekly", "weekly").map((i) => i.id)).toEqual(["itm_wp"]);
  });
});
