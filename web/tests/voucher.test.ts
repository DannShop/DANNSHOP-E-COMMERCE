import { describe, expect, it } from "vitest";
import { isValidVoucherCode, normalizeVoucherCode, CODE_MAX_LENGTH } from "@/lib/voucher/code";
import { buildTargetKey } from "@/lib/voucher/target-key";
import { checkVoucher, rawDiscount, type VoucherContext, type VoucherRules } from "@/lib/voucher/discount";
import { netPrice, buildVoucherRedemption } from "@/lib/voucher/apply";

const BASE_RULES: VoucherRules = {
  discountType: "PERCENT",
  percentBp: 1000, // 10%
  amount: 0n,
  minSpend: 0n,
  quota: 0,
  perTargetLimit: 0,
  startAt: null,
  endAt: null,
  isActive: true,
  allowFlashSale: false,
  allowGuest: true,
  categoryIds: [],
  productIds: [],
};

const BASE_CTX: VoucherContext = {
  price: 100_000n,
  categoryId: "cat-game",
  productId: "prod-ml",
  isFlashActive: false,
  isGuest: false,
  now: new Date("2026-08-15T10:00:00Z"),
  usedTotal: 0,
  usedByTarget: 0,
};

const rules = (o: Partial<VoucherRules> = {}): VoucherRules => ({ ...BASE_RULES, ...o });
const ctx = (o: Partial<VoucherContext> = {}): VoucherContext => ({ ...BASE_CTX, ...o });

describe("normalizeVoucherCode", () => {
  it("menyeragamkan huruf besar & spasi tepi", () => {
    expect(normalizeVoucherCode("  hemat10 ")).toBe("HEMAT10");
    // Penyeragaman harus IDEMPOTEN: dipakai saat admin menyimpan DAN saat
    // pembeli menukarkan, jadi hasilnya harus sama berapa kali pun dijalankan.
    expect(normalizeVoucherCode(normalizeVoucherCode("hemat10"))).toBe("HEMAT10");
  });

  it("menolak karakter yang merusak kode di URL atau saat didiktekan", () => {
    expect(isValidVoucherCode("HEMAT 10")).toBe(false); // spasi
    expect(isValidVoucherCode("HEMAT/10")).toBe(false);
    expect(isValidVoucherCode("HEMAT#10")).toBe(false);
    expect(isValidVoucherCode("")).toBe(false);
    expect(isValidVoucherCode("A".repeat(CODE_MAX_LENGTH + 1))).toBe(false);
  });

  it("menerima huruf, angka, tanda hubung, dan garis bawah", () => {
    expect(isValidVoucherCode("HEMAT-10")).toBe(true);
    expect(isValidVoucherCode("PROMO_AGUSTUS2026")).toBe(true);
  });
});

describe("buildTargetKey", () => {
  it("tidak bergantung pada urutan field", () => {
    // Form HTML tidak menjamin urutan penyisipan yang sama tiap kali. Kalau
    // kuncinya ikut berubah, batas "maksimal sekali per tujuan" bisa ditembus
    // hanya dengan memuat ulang halaman.
    expect(buildTargetKey({ user_id: "123", zone_id: "4567" })).toBe(
      buildTargetKey({ zone_id: "4567", user_id: "123" }),
    );
  });

  it("menyamakan nomor yang ditulis dengan pemisah berbeda", () => {
    const a = buildTargetKey({ phone_number: "0812-3456-7890" });
    const b = buildTargetKey({ phone_number: "0812 3456 7890" });
    const c = buildTargetKey({ phone_number: "081234567890" });
    expect(a).toBe(c);
    expect(b).toBe(c);
  });

  it("membedakan tujuan yang memang berbeda", () => {
    expect(buildTargetKey({ user_id: "123", zone_id: "1" })).not.toBe(
      buildTargetKey({ user_id: "123", zone_id: "2" }),
    );
    // ID yang sama pada field berbeda BUKAN tujuan yang sama.
    expect(buildTargetKey({ user_id: "123" })).not.toBe(buildTargetKey({ zone_id: "123" }));
  });

  it("mengabaikan field kosong", () => {
    expect(buildTargetKey({ user_id: "123", zone_id: "  " })).toBe(buildTargetKey({ user_id: "123" }));
  });
});

describe("rawDiscount", () => {
  it("menghitung persentase pada basis 10.000", () => {
    expect(rawDiscount(rules({ percentBp: 1000 }), 100_000n)).toBe(10_000n);
    expect(rawDiscount(rules({ percentBp: 250 }), 100_000n)).toBe(2_500n);
  });

  it("membatasi potongan persentase dengan amount", () => {
    // 10% dari 1 juta = 100.000, tapi dibatasi 25.000.
    expect(rawDiscount(rules({ percentBp: 1000, amount: 25_000n }), 1_000_000n)).toBe(25_000n);
    // Batas tidak berlaku kalau potongannya memang di bawah batas.
    expect(rawDiscount(rules({ percentBp: 1000, amount: 25_000n }), 100_000n)).toBe(10_000n);
  });

  it("amount = 0 berarti tanpa batas, bukan potongan nol", () => {
    expect(rawDiscount(rules({ percentBp: 1000, amount: 0n }), 1_000_000n)).toBe(100_000n);
  });

  it("mode FIXED memakai amount apa adanya", () => {
    expect(rawDiscount(rules({ discountType: "FIXED", amount: 5_000n }), 100_000n)).toBe(5_000n);
  });
});

describe("checkVoucher", () => {
  it("meloloskan voucher yang sehat", () => {
    const hasil = checkVoucher(rules(), ctx());
    expect(hasil).toEqual({ ok: true, discount: 10_000n });
  });

  it("menolak voucher nonaktif & di luar masa berlaku", () => {
    expect(checkVoucher(rules({ isActive: false }), ctx())).toMatchObject({ reason: "TIDAK_AKTIF" });
    expect(
      checkVoucher(rules({ startAt: new Date("2026-09-01T00:00:00Z") }), ctx()),
    ).toMatchObject({ reason: "BELUM_MULAI" });
    expect(checkVoucher(rules({ endAt: new Date("2026-08-01T00:00:00Z") }), ctx())).toMatchObject({
      reason: "SUDAH_BERAKHIR",
    });
  });

  it("menegakkan kuota total", () => {
    expect(checkVoucher(rules({ quota: 5 }), ctx({ usedTotal: 5 }))).toMatchObject({
      reason: "KUOTA_HABIS",
    });
    expect(checkVoucher(rules({ quota: 5 }), ctx({ usedTotal: 4 }))).toMatchObject({ ok: true });
    // quota 0 = tak terbatas, BUKAN habis. Salah membaca ini akan membuat setiap
    // voucher tanpa kuota ditolak di mana-mana.
    expect(checkVoucher(rules({ quota: 0 }), ctx({ usedTotal: 9_999 }))).toMatchObject({ ok: true });
  });

  it("menegakkan batas per nomor tujuan", () => {
    expect(checkVoucher(rules({ perTargetLimit: 1 }), ctx({ usedByTarget: 1 }))).toMatchObject({
      reason: "BATAS_TUJUAN",
    });
    expect(checkVoucher(rules({ perTargetLimit: 2 }), ctx({ usedByTarget: 1 }))).toMatchObject({
      ok: true,
    });
    expect(checkVoucher(rules({ perTargetLimit: 0 }), ctx({ usedByTarget: 99 }))).toMatchObject({
      ok: true,
    });
  });

  it("menolak tamu hanya kalau vouchernya memang khusus member", () => {
    expect(checkVoucher(rules({ allowGuest: false }), ctx({ isGuest: true }))).toMatchObject({
      reason: "BUKAN_UNTUK_TAMU",
    });
    expect(checkVoucher(rules({ allowGuest: true }), ctx({ isGuest: true }))).toMatchObject({ ok: true });
  });

  it("menahan penumpukan dengan flash sale kecuali diizinkan", () => {
    // Bawaannya TIDAK boleh - flash sale sudah memotong harga sekali.
    expect(checkVoucher(rules(), ctx({ isFlashActive: true }))).toMatchObject({
      reason: "TIDAK_BERLAKU_SAAT_FLASH",
    });
    expect(checkVoucher(rules({ allowFlashSale: true }), ctx({ isFlashActive: true }))).toMatchObject({
      ok: true,
    });
  });

  it("pembatas kosong berarti berlaku untuk semua", () => {
    expect(checkVoucher(rules({ categoryIds: [], productIds: [] }), ctx())).toMatchObject({ ok: true });
  });

  it("menegakkan pembatas kategori & produk", () => {
    expect(checkVoucher(rules({ categoryIds: ["cat-lain"] }), ctx())).toMatchObject({
      reason: "TIDAK_BERLAKU_DI_PRODUK",
    });
    expect(checkVoucher(rules({ categoryIds: ["cat-game"] }), ctx())).toMatchObject({ ok: true });
    expect(checkVoucher(rules({ productIds: ["prod-lain"] }), ctx())).toMatchObject({
      reason: "TIDAK_BERLAKU_DI_PRODUK",
    });
  });

  it("menggabungkan dua pembatas dengan DAN, bukan ATAU", () => {
    // Kategori cocok tapi produk tidak -> tetap ditolak.
    const r = rules({ categoryIds: ["cat-game"], productIds: ["prod-lain"] });
    expect(checkVoucher(r, ctx())).toMatchObject({ reason: "TIDAK_BERLAKU_DI_PRODUK" });
  });

  it("menegakkan minimal belanja", () => {
    expect(checkVoucher(rules({ minSpend: 200_000n }), ctx({ price: 100_000n }))).toMatchObject({
      reason: "MINIMAL_BELANJA",
    });
    expect(checkVoucher(rules({ minSpend: 100_000n }), ctx({ price: 100_000n }))).toMatchObject({
      ok: true,
    });
  });

  // INI PENJAGA UANGNYA. Potongan nominal yang lebih besar dari harga item akan
  // menghasilkan tagihan negatif - dan di jalur bayar-saldo, tagihan negatif
  // berarti saldo pembeli BERTAMBAH setiap kali dia "membeli".
  it("menjepit potongan ke harga item, tidak pernah menghasilkan tagihan minus", () => {
    const hasil = checkVoucher(rules({ discountType: "FIXED", amount: 500_000n }), ctx({ price: 10_000n }));
    expect(hasil).toEqual({ ok: true, discount: 10_000n });
    expect(netPrice(10_000n, { id: "v", code: "X", discount: 10_000n, targetKey: "t" })).toBe(0n);
  });

  it("menolak voucher yang potongannya nol", () => {
    // Kode yang "diterima" tapi tidak memotong apa pun lebih membingungkan
    // daripada kode yang ditolak terang-terangan.
    expect(checkVoucher(rules({ percentBp: 0 }), ctx())).toMatchObject({ ok: false });
  });
});

describe("netPrice", () => {
  it("tanpa voucher mengembalikan harga apa adanya", () => {
    expect(netPrice(50_000n, null)).toBe(50_000n);
  });

  it("tidak pernah negatif walau potongannya berlebihan", () => {
    expect(netPrice(10_000n, { id: "v", code: "X", discount: 999_999n, targetKey: "t" })).toBe(0n);
  });
});

describe("buildVoucherRedemption", () => {
  it("tanpa voucher tidak menambah kolom apa pun ke order", () => {
    expect(buildVoucherRedemption(null, "user-1")).toEqual({});
  });

  it("menempelkan catatan pemakaian sebagai nested create", () => {
    // Nested create (bukan penulisan kedua yang terpisah) adalah yang menjamin
    // order bervoucher dan catatan kuotanya lahir bersama atau tidak sama
    // sekali - order dengan potongan yang tidak terhitung ke kuota mana pun
    // berarti voucher berkuota bisa dipakai tanpa batas.
    const hasil = buildVoucherRedemption(
      { id: "v1", code: "HEMAT10", discount: 10_000n, targetKey: "user_id=123" },
      "user-1",
    );
    expect(hasil.discount).toBe(10_000n);
    expect(hasil.voucherCode).toBe("HEMAT10");
    expect(hasil.voucherRedemption).toEqual({
      create: { voucherId: "v1", targetKey: "user_id=123", userId: "user-1", amount: 10_000n },
    });
  });

  it("mencatat pembeli tamu sebagai userId null", () => {
    const hasil = buildVoucherRedemption(
      { id: "v1", code: "X", discount: 1n, targetKey: "t" },
      null,
    );
    expect(hasil.voucherRedemption).toMatchObject({ create: { userId: null } });
  });
});
