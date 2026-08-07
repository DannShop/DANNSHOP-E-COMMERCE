import { describe, expect, it } from "vitest";
import { effectivePrice, isFlashActive, type PricedItem } from "@/lib/pricing/effective-price";

const now = new Date("2026-08-06T10:00:00Z");

function item(overrides: Partial<PricedItem> = {}): PricedItem {
  return {
    sellingPrice: 10_000n,
    memberPrice: 9_000n,
    flashPrice: null,
    flashStartAt: null,
    flashEndAt: null,
    ...overrides,
  };
}

describe("isFlashActive", () => {
  it("false kalau tidak ada field flash sama sekali", () => {
    expect(isFlashActive(item(), now)).toBe(false);
  });

  it("true kalau now di antara flashStartAt dan flashEndAt", () => {
    const flashItem = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T09:00:00Z"),
      flashEndAt: new Date("2026-08-06T11:00:00Z"),
    });
    expect(isFlashActive(flashItem, now)).toBe(true);
  });

  it("false kalau now sebelum flashStartAt atau sesudah flashEndAt", () => {
    const notYet = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T11:00:00Z"),
      flashEndAt: new Date("2026-08-06T12:00:00Z"),
    });
    const expired = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T08:00:00Z"),
      flashEndAt: new Date("2026-08-06T09:00:00Z"),
    });
    expect(isFlashActive(notYet, now)).toBe(false);
    expect(isFlashActive(expired, now)).toBe(false);
  });
});

describe("effectivePrice", () => {
  it("tanpa tier (discountBp 0), tanpa flash → sellingPrice", () => {
    expect(effectivePrice(item(), { discountBp: 0, now })).toBe(10_000n);
  });

  it("login tanpa tier aktif TETAP sellingPrice (Fase B: login saja tidak lagi diskon otomatis)", () => {
    // Item dengan memberPrice jauh lebih murah dari sellingPrice - kalau ini
    // balik ke 9_000n, berarti perilaku lama "login = otomatis murah" diam-diam
    // hidup lagi meski discountBp 0.
    expect(effectivePrice(item({ memberPrice: 1_000n }), { discountBp: 0, now })).toBe(10_000n);
  });

  it("tier dengan diskon 10% (1000bp) → sellingPrice dipotong 10%", () => {
    expect(effectivePrice(item(), { discountBp: 1000, now })).toBe(9_000n);
  });

  it("diskon tier dilantai memberPrice - tidak pernah lebih murah dari itu", () => {
    // Diskon 50% dari 10_000 = 5_000, tapi memberPrice (lantai) 9_000 -> harus 9_000
    expect(effectivePrice(item(), { discountBp: 5000, now })).toBe(9_000n);
  });

  it("diskon tier yang hasilnya masih di atas memberPrice tidak kena lantai", () => {
    // Diskon 5% dari 10_000 = 9_500, masih di atas memberPrice 9_000
    expect(effectivePrice(item(), { discountBp: 500, now })).toBe(9_500n);
  });

  it("guest, flash aktif → flashPrice", () => {
    const flashItem = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T09:00:00Z"),
      flashEndAt: new Date("2026-08-06T11:00:00Z"),
    });
    expect(effectivePrice(flashItem, { discountBp: 0, now })).toBe(7_000n);
  });

  it("tier aktif, flash aktif → flashPrice menang atas diskon tier", () => {
    const flashItem = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T09:00:00Z"),
      flashEndAt: new Date("2026-08-06T11:00:00Z"),
    });
    expect(effectivePrice(flashItem, { discountBp: 1000, now })).toBe(7_000n);
  });

  it("tier aktif, flash sudah lewat → balik ke diskon tier, bukan sellingPrice", () => {
    const expiredFlash = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T08:00:00Z"),
      flashEndAt: new Date("2026-08-06T09:00:00Z"),
    });
    expect(effectivePrice(expiredFlash, { discountBp: 1000, now })).toBe(9_000n);
  });
});
