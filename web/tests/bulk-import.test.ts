import { describe, expect, it } from "vitest";
import { applyMarkup, selectBrandsWithinBudget, slugifyBrand } from "@/lib/catalog/bulk-import";

describe("slugifyBrand", () => {
  it("mengubah nama brand jadi slug lowercase-dash", () => {
    expect(slugifyBrand("Mobile Legends")).toBe("mobile-legends");
  });

  it("membuang karakter non-alfanumerik", () => {
    expect(slugifyBrand("Free Fire: Max!")).toBe("free-fire-max");
  });

  it("membuang dash di awal/akhir hasil trim", () => {
    expect(slugifyBrand("  PLN  ")).toBe("pln");
  });
});

describe("applyMarkup", () => {
  it("menghitung markup 10% dari harga modal", () => {
    expect(applyMarkup(10_000n, 10)).toBe(11_000n);
  });

  it("markup 0% mengembalikan harga modal apa adanya", () => {
    expect(applyMarkup(25_000n, 0)).toBe(25_000n);
  });

  it("membulatkan hasil pecahan ke bawah (integer division)", () => {
    // 999 * 1.075 = 1073.925 -> basis 10000 pembulatan tidak menghasilkan pecahan rupiah
    expect(applyMarkup(999n, 7.5)).toBe(1073n);
  });

  it("menolak markup negatif", () => {
    expect(() => applyMarkup(10_000n, -5)).toThrow();
  });
});

// Bulk-import bekerja PER BRAND: satu brand jadi satu Product, baris yang
// dicentang jadi ProductItem. Karena itu daftar yang dikirim ke layar tidak boleh
// memuat brand setengah — kalau "TPG Diamond Mobile Legends" (114 denominasi)
// terpotong di baris ke-50, admin mengimpor produk yang kekurangan denominasi
// TANPA satu pun tanda di layar. Memotong per BARIS (LIMIT biasa) melakukan
// tepat itu; fungsi ini memotong per BRAND supaya yang tampil selalu utuh.
describe("selectBrandsWithinBudget", () => {
  const b = (name: string, rowCount: number) => ({ brand: name, rowCount });

  it("mengambil brand selama anggaran baris masih cukup", () => {
    const out = selectBrandsWithinBudget([b("A", 100), b("B", 100), b("C", 100)], 250);
    expect(out.map((x) => x.brand)).toEqual(["A", "B"]);
  });

  it("berhenti sebelum brand yang bikin anggaran terlampaui — tidak memotongnya", () => {
    const out = selectBrandsWithinBudget([b("A", 40), b("B", 300)], 100);
    expect(out.map((x) => x.brand)).toEqual(["A"]);
  });

  it("brand pertama SELALU ikut walau sendirian sudah melebihi anggaran", () => {
    // Kalau tidak, mencari brand raksasa akan menghasilkan layar kosong dan admin
    // menyimpulkan produknya tidak ada — padahal ada 300 denominasi.
    const out = selectBrandsWithinBudget([b("RAKSASA", 300)], 100);
    expect(out.map((x) => x.brand)).toEqual(["RAKSASA"]);
  });

  it("semua muat → semuanya dikembalikan", () => {
    const all = [b("A", 10), b("B", 20)];
    expect(selectBrandsWithinBudget(all, 1000)).toEqual(all);
  });

  it("daftar kosong → hasil kosong", () => {
    expect(selectBrandsWithinBudget([], 100)).toEqual([]);
  });

  it("tidak melewati brand besar demi menjejalkan brand kecil sesudahnya", () => {
    // Urutan harus dipertahankan apa adanya. Melompati B lalu mengambil C
    // membuat hasil terlihat acak bagi admin yang mengurutkan berdasarkan nama.
    const out = selectBrandsWithinBudget([b("A", 60), b("B", 200), b("C", 5)], 100);
    expect(out.map((x) => x.brand)).toEqual(["A"]);
  });
});
