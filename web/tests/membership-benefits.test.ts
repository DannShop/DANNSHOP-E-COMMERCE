import { describe, expect, it } from "vitest";
import { BENEFIT_CATALOG, isValidBenefitKey, parseBenefits, hasBenefit } from "@/lib/membership/benefits";

describe("isValidBenefitKey", () => {
  it("semua key di katalog valid", () => {
    for (const b of BENEFIT_CATALOG) {
      expect(isValidBenefitKey(b.key)).toBe(true);
    }
  });

  it("key liar ditolak", () => {
    expect(isValidBenefitKey("beli_mobil_gratis")).toBe(false);
  });
});

describe("parseBenefits", () => {
  it("array string valid dari katalog → diteruskan apa adanya", () => {
    expect(parseBenefits(["free_order_fee", "deposit_bonus"])).toEqual(["free_order_fee", "deposit_bonus"]);
  });

  it("key yang tidak ada di katalog (mis. fitur sudah di-deprecate) difilter", () => {
    expect(parseBenefits(["free_order_fee", "fitur_lama_sudah_dihapus"])).toEqual(["free_order_fee"]);
  });

  it("bukan array (null, object, string) → array kosong, tidak throw", () => {
    expect(parseBenefits(null)).toEqual([]);
    expect(parseBenefits(undefined)).toEqual([]);
    expect(parseBenefits({ foo: "bar" })).toEqual([]);
    expect(parseBenefits("free_order_fee")).toEqual([]);
  });

  it("elemen non-string di dalam array difilter, bukan bikin crash", () => {
    expect(parseBenefits(["free_order_fee", 123, null, {}])).toEqual(["free_order_fee"]);
  });
});

describe("hasBenefit", () => {
  it("true kalau key ada di daftar", () => {
    expect(hasBenefit(["free_order_fee", "deposit_bonus"], "deposit_bonus")).toBe(true);
  });

  it("false kalau key tidak ada", () => {
    expect(hasBenefit(["free_order_fee"], "deposit_bonus")).toBe(false);
  });

  it("false untuk daftar kosong (tidak ada tier aktif)", () => {
    expect(hasBenefit([], "free_order_fee")).toBe(false);
  });
});
