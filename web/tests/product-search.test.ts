import { describe, expect, it } from "vitest";
import { matchesProductQuery, type SearchableProduct } from "@/lib/catalog/product-search";

const p = (over: Partial<SearchableProduct> = {}): SearchableProduct => ({
  name: "Mobile Legends",
  publisher: "Moonton",
  categoryName: "Games",
  ...over,
});

describe("matchesProductQuery", () => {
  it("kata kunci kosong cocok dengan semuanya", () => {
    // Kotak kosong berarti "tidak sedang mencari", bukan "tidak ada yang cocok".
    expect(matchesProductQuery(p(), "")).toBe(true);
    expect(matchesProductQuery(p(), "   ")).toBe(true);
  });

  it("cocok sebagian nama, tidak harus dari awal", () => {
    // Orang mengetik potongan yang diingat, bukan awalan resmi.
    expect(matchesProductQuery(p(), "legend")).toBe(true);
    expect(matchesProductQuery(p(), "bile")).toBe(true);
  });

  it("tidak peduli huruf besar-kecil", () => {
    expect(matchesProductQuery(p(), "MOBILE")).toBe(true);
    expect(matchesProductQuery(p({ name: "FREE FIRE" }), "free")).toBe(true);
  });

  it("semua kata harus cocok, tapi urutannya bebas", () => {
    // "legends mobile" tetap ketemu — orang sering membalik urutan, dan
    // menuntut urutan persis membuat pencarian terasa rusak.
    expect(matchesProductQuery(p(), "mobile legends")).toBe(true);
    expect(matchesProductQuery(p(), "legends mobile")).toBe(true);
    expect(matchesProductQuery(p(), "mobile fire")).toBe(false);
  });

  it("ikut mencari di publisher dan nama kategori", () => {
    // Sebagian orang ingat penerbitnya, bukan judulnya; sebagian lagi mengetik
    // kategorinya ("pulsa") dan berharap semua pulsa muncul.
    expect(matchesProductQuery(p(), "moonton")).toBe(true);
    expect(matchesProductQuery(p({ categoryName: "Pulsa" }), "pulsa")).toBe(true);
  });

  it("publisher kosong tidak bikin error", () => {
    expect(matchesProductQuery(p({ publisher: null }), "mobile")).toBe(true);
    expect(matchesProductQuery(p({ publisher: null }), "moonton")).toBe(false);
  });

  it("spasi berlebih di kata kunci diabaikan", () => {
    expect(matchesProductQuery(p(), "  mobile    legends  ")).toBe(true);
  });

  it("yang tidak cocok tetap tidak cocok", () => {
    expect(matchesProductQuery(p(), "telkomsel")).toBe(false);
  });

  it("cocok pada nama hasil normalisasi brand OkeConnect", () => {
    // Nama seperti ini yang benar-benar akan ada di katalog setelah impor.
    const item = p({ name: "Indosat Cetak Voucher Freedom Mini", publisher: null, categoryName: "Kuota Indosat" });
    expect(matchesProductQuery(item, "indosat")).toBe(true);
    expect(matchesProductQuery(item, "freedom mini")).toBe(true);
    expect(matchesProductQuery(item, "kuota indosat")).toBe(true);
  });
});
