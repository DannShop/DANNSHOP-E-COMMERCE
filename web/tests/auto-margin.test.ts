import { describe, expect, it } from "vitest";
import { recalcSellingPrice, roundUpTo, type AutoMarginRule } from "@/lib/catalog/auto-margin";

const rule = (over: Partial<AutoMarginRule> = {}): AutoMarginRule => ({
  mode: "FOLLOW_DELTA",
  marginBp: 800, // 8%
  roundTo: 100,
  maxJumpBp: 5000, // 50%
  ...over,
});

const input = (over: Partial<Parameters<typeof recalcSellingPrice>[1]> = {}) => ({
  oldCost: 5_089n,
  newCost: 5_200n,
  currentSelling: 5_400n,
  flashPrice: null,
  ...over,
});

describe("roundUpTo", () => {
  it("membulatkan KE ATAS ke kelipatan terdekat", () => {
    // Selalu ke atas, tidak pernah ke bawah: pembulatan ke bawah memakan margin
    // yang baru saja dihitung, dan memakannya di SETIAP sync.
    expect(roundUpTo(10_437n, 100n)).toBe(10_500n);
    expect(roundUpTo(10_501n, 500n)).toBe(11_000n);
  });

  it("angka yang sudah pas tidak dinaikkan lagi", () => {
    expect(roundUpTo(10_500n, 100n)).toBe(10_500n);
    expect(roundUpTo(11_000n, 500n)).toBe(11_000n);
  });

  it("kelipatan 0 atau 1 = tanpa pembulatan", () => {
    expect(roundUpTo(10_437n, 0n)).toBe(10_437n);
    expect(roundUpTo(10_437n, 1n)).toBe(10_437n);
  });
});

describe("recalcSellingPrice — mode OFF", () => {
  it("tidak pernah menyentuh harga", () => {
    expect(recalcSellingPrice(rule({ mode: "OFF" }), input())).toEqual({ action: "unchanged" });
  });
});

describe("recalcSellingPrice — FOLLOW_DELTA", () => {
  it("modal naik → harga jual naik sebesar kenaikan yang sama", () => {
    // 5.400 + (5.200 - 5.089) = 5.511 → dibulatkan ke atas ke 5.600
    const out = recalcSellingPrice(rule(), input());
    expect(out).toEqual({ action: "update", newSelling: 5_600n });
  });

  it("modal turun → harga jual ikut turun", () => {
    const out = recalcSellingPrice(rule(), input({ oldCost: 25_300n, newCost: 25_100n, currentSelling: 25_900n }));
    // 25.900 - 200 = 25.700, sudah kelipatan 100
    expect(out).toEqual({ action: "update", newSelling: 25_700n });
  });

  it("modal TIDAK berubah → item tidak disentuh sama sekali", () => {
    // Inti dari mode ini: harga yang sudah di-tune manual tetap aman selama
    // providernya tidak mengubah apa pun.
    expect(recalcSellingPrice(rule(), input({ oldCost: 5_089n, newCost: 5_089n }))).toEqual({ action: "unchanged" });
  });

  it("margin tiap item dipertahankan, bukan diseragamkan", () => {
    const naik = 111n;
    const a = recalcSellingPrice(rule({ roundTo: 0 }), input({ currentSelling: 5_400n }));
    const b = recalcSellingPrice(rule({ roundTo: 0 }), input({ currentSelling: 9_999n }));
    expect(a).toEqual({ action: "update", newSelling: 5_400n + naik });
    expect(b).toEqual({ action: "update", newSelling: 9_999n + naik });
  });
});

describe("recalcSellingPrice — FORMULA", () => {
  it("harga jual dihitung ulang dari modal × (1 + margin)", () => {
    // 5.200 × 1,08 = 5.616 → dibulatkan ke atas ke 5.700
    const out = recalcSellingPrice(rule({ mode: "FORMULA" }), input());
    expect(out).toEqual({ action: "update", newSelling: 5_700n });
  });

  it("modal tidak berubah pun tetap dihitung ulang", () => {
    // Beda mendasar dari FOLLOW_DELTA, dan justru ini yang diinginkan saat
    // memilih FORMULA: seluruh kategori diseragamkan ke satu margin.
    const out = recalcSellingPrice(rule({ mode: "FORMULA" }), input({ oldCost: 5_200n, newCost: 5_200n, currentSelling: 9_999n }));
    expect(out).toEqual({ action: "update", newSelling: 5_700n });
  });

  it("hasil yang sudah sama persis tidak ditulis ulang", () => {
    const out = recalcSellingPrice(rule({ mode: "FORMULA" }), input({ oldCost: 5_200n, newCost: 5_200n, currentSelling: 5_700n }));
    expect(out).toEqual({ action: "unchanged" });
  });
});

describe("penjaga", () => {
  it("lonjakan modal tidak wajar → dilewati, bukan diikuti", () => {
    // Provider yang salah kirim data (mis. 10× lipat) tidak boleh diam-diam
    // menaikkan harga jual 10× juga. Lebih baik harga lama bertahan dan
    // kejanggalannya dilaporkan ke admin.
    const out = recalcSellingPrice(rule(), input({ oldCost: 5_000n, newCost: 60_000n }));
    expect(out.action).toBe("skipped");
  });

  it("penurunan modal yang tidak wajar juga dilewati", () => {
    const out = recalcSellingPrice(rule(), input({ oldCost: 50_000n, newCost: 1_000n, currentSelling: 55_000n }));
    expect(out.action).toBe("skipped");
  });

  it("item yang SUDAH jual rugi tidak diseret makin dalam", () => {
    // Jaring terakhir, dan kasusnya nyata: panel admin punya lencana "Jual rugi",
    // artinya item seperti ini memang bisa ada. Pada FOLLOW_DELTA, target selalu
    // = jual + (modal baru − modal lama), jadi hasilnya berada di bawah modal
    // tepat ketika item itu memang sudah dijual di bawah modal sebelumnya.
    // Menyesuaikannya otomatis cuma memindahkan kerugian, bukan memperbaikinya —
    // yang benar adalah berhenti dan menyerahkannya ke admin.
    const out = recalcSellingPrice(
      rule({ roundTo: 0 }),
      input({ oldCost: 5_000n, newCost: 5_400n, currentSelling: 4_900n }),
    );
    expect(out.action).toBe("skipped");
  });

  it("bentrok flash sale → dilewati, flash sale tidak pernah dirusak diam-diam", () => {
    const out = recalcSellingPrice(rule(), input({ flashPrice: 9_000n }));
    expect(out.action).toBe("skipped");
  });

  it("flash sale yang masih lebih murah dari harga baru tidak menghalangi", () => {
    const out = recalcSellingPrice(rule(), input({ flashPrice: 5_000n }));
    expect(out.action).toBe("update");
  });

  it("modal lama nol tidak bikin pembagian nol saat mengecek lonjakan", () => {
    const out = recalcSellingPrice(rule({ mode: "FORMULA" }), input({ oldCost: 0n, newCost: 5_200n }));
    expect(out.action).toBe("update");
  });
});
