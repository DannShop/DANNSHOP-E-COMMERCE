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
  it("guest, tanpa flash → sellingPrice", () => {
    expect(effectivePrice(item(), { isMember: false, now })).toBe(10_000n);
  });

  it("member, tanpa flash → memberPrice", () => {
    expect(effectivePrice(item(), { isMember: true, now })).toBe(9_000n);
  });

  it("guest, flash aktif → flashPrice", () => {
    const flashItem = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T09:00:00Z"),
      flashEndAt: new Date("2026-08-06T11:00:00Z"),
    });
    expect(effectivePrice(flashItem, { isMember: false, now })).toBe(7_000n);
  });

  it("member, flash aktif → flashPrice menang atas memberPrice", () => {
    const flashItem = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T09:00:00Z"),
      flashEndAt: new Date("2026-08-06T11:00:00Z"),
    });
    expect(effectivePrice(flashItem, { isMember: true, now })).toBe(7_000n);
  });

  it("member, flash sudah lewat → balik ke memberPrice, bukan sellingPrice", () => {
    const expiredFlash = item({
      flashPrice: 7_000n,
      flashStartAt: new Date("2026-08-06T08:00:00Z"),
      flashEndAt: new Date("2026-08-06T09:00:00Z"),
    });
    expect(effectivePrice(expiredFlash, { isMember: true, now })).toBe(9_000n);
  });
});
