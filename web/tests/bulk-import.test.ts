import { describe, expect, it } from "vitest";
import { applyMarkup, slugifyBrand } from "@/lib/catalog/bulk-import";

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
