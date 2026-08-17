import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { findUnique: vi.fn() };
vi.mock("@/lib/db", () => ({ db: { user } }));

const getPartnerPackage = vi.fn();
vi.mock("@/lib/partner/package", () => ({ getPartnerPackage }));

beforeEach(() => {
  user.findUnique.mockReset();
  getPartnerPackage.mockReset();
});

/**
 * Membungkus baris reseller jadi bentuk yang dikembalikan query gabungan.
 *
 * Sejak paket mitra ada, satu query mengambil DUA kemungkinan sumber sekaligus
 * (partnerAccount & resellerAccount) - memisahkannya berarti setiap checkout
 * pembeli biasa membayar satu perjalanan ke database hanya untuk memastikan dia
 * bukan mitra.
 */
function asUser(patch: { reseller?: unknown; partner?: unknown } = {}) {
  return {
    partnerAccount: patch.partner ?? null,
    resellerAccount: patch.reseller ?? null,
  };
}

/**
 * getMembershipContext adalah SATU-SATUNYA penentu "apakah orang ini dapat
 * potongan harga", dan punya 16 pemanggil — checkout, deposit, voucher, harga
 * produk, price list mitra, panel admin. Sumber datanya berpindah dari
 * UserMembership ke ResellerAccount saat program membership diganti program
 * reseller (2026-08-17), tapi BENTUK jawabannya sengaja tidak berubah sedikit
 * pun, supaya keenam belas pemanggil itu tidak perlu disentuh.
 *
 * Yang dikunci di sini adalah tiga keadaan yang semuanya berarti HARGA NORMAL.
 * Ketiganya gampang tertukar, dan salah satu saja yang bocor berarti potongan
 * harga diberikan ke orang yang belum berhak — tanpa error di mana pun.
 */
const tierGold = {
  id: "tier-gold",
  name: "Gold",
  slug: "gold",
  badgeColor: "#eab308",
  discountPercent: 700,
  depositBonusPercent: 200,
  benefits: ["free_order_fee", "deposit_bonus"],
};

/** Reseller lengkap: aktif, sudah aktivasi, punya paket berbayar. */
function resellerLengkap(patch: Record<string, unknown> = {}) {
  return { isActive: true, activatedAt: new Date(), tier: tierGold, ...patch };
}

describe("getMembershipContext", () => {
  it("userId null (guest) → NO_MEMBERSHIP tanpa query DB", async () => {
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext(null);
    expect(ctx).toEqual(NO_MEMBERSHIP);
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it("bukan reseller sama sekali → NO_MEMBERSHIP", async () => {
    user.findUnique.mockResolvedValue(asUser());
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Paket gratis TIDAK diwujudkan sebagai baris tier apa pun - "tidak punya
  // tier" itulah paket gratisnya, dan jawabannya harga normal.
  it("reseller di paket GRATIS → NO_MEMBERSHIP (harga normal)", async () => {
    user.findUnique.mockResolvedValue(asUser({ reseller: resellerLengkap({ tier: null }) }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Sudah mengisi formulir tapi link aktivasinya belum diklik. Selama itu, dia
  // belum terbukti memegang inbox-nya sendiri.
  it("reseller yang BELUM aktivasi → NO_MEMBERSHIP walau punya paket", async () => {
    user.findUnique.mockResolvedValue(asUser({ reseller: resellerLengkap({ activatedAt: null }) }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Dicabut admin. Potongan harus berhenti SEKETIKA, bukan setelah sesinya habis.
  it("reseller yang dinonaktifkan admin → NO_MEMBERSHIP walau punya paket", async () => {
    user.findUnique.mockResolvedValue(asUser({ reseller: resellerLengkap({ isActive: false }) }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  it("reseller aktif berpaket → discountBp dari paket, benefits diparse dari Json", async () => {
    user.findUnique.mockResolvedValue(asUser({ reseller: resellerLengkap() }));
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.tier?.name).toBe("Gold");
    expect(ctx.discountBp).toBe(700);
    expect(ctx.depositBonusBp).toBe(200);
    expect(ctx.benefits).toEqual(["free_order_fee", "deposit_bonus"]);
  });

  // Paket reseller sekali bayar, berlaku selamanya - jadi tidak ada tanggal
  // habis untuk ditampilkan. null di sini berarti SEUMUR HIDUP, bukan "tidak
  // punya paket"; yang membedakan keduanya adalah `tier`.
  it("expiresAt selalu null karena paketnya seumur hidup", async () => {
    user.findUnique.mockResolvedValue(asUser({ reseller: resellerLengkap() }));
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.expiresAt).toBeNull();
    expect(ctx.tier).not.toBeNull();
  });

  it("depositBonusBp 0 kalau benefit deposit_bonus TIDAK dicentang, walau angkanya > 0", async () => {
    // Skenario penting: admin sempat isi angka bonus lalu MATIKAN checkbox-nya
    // tanpa reset ke 0 - angka lama harus diam, tidak diam-diam aktif lagi.
    user.findUnique.mockResolvedValue(
      asUser({
        reseller: resellerLengkap({
          tier: { ...tierGold, depositBonusPercent: 500, benefits: ["free_order_fee"] },
        }),
      }),
    );
    const { getMembershipContext } = await import("@/lib/membership/tier");
    expect((await getMembershipContext("user-1")).depositBonusBp).toBe(0);
  });

  it("mencari berdasarkan userId dan ikut mengambil paketnya", async () => {
    user.findUnique.mockResolvedValue(asUser({ reseller: resellerLengkap() }));
    const { getMembershipContext } = await import("@/lib/membership/tier");
    await getMembershipContext("user-1");
    const call = user.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ id: "user-1" });
    expect(call.select.resellerAccount).toEqual({ include: { tier: true } });
  });
});

/**
 * Paket mitra H2H — sumber diskon KEDUA, terpisah total dari tier reseller.
 *
 * Sebelum ini ada, mitra hanya bisa mendapat harga khusus dengan ikut mendaftar
 * sebagai reseller eceran, dan diskonnya terpaksa sama persis dengan reseller.
 * Yang dikunci di bawah adalah aturan-aturan yang kalau bocor akan salah
 * memberi harga tanpa memunculkan error di mana pun.
 */
describe("getMembershipContext — paket mitra", () => {
  const paketMitra = {
    joinPrice: 500_000n,
    discountPercent: 450,
    discountFlatManual: 2_000n,
    depositBonusPercent: 100,
    benefits: ["deposit_bonus", "priority_badge"],
    isOpen: true,
  };

  it("mitra aktif → diskon dari paket mitra, bukan dari tier reseller", async () => {
    user.findUnique.mockResolvedValue(asUser({ partner: { isActive: true } }));
    getPartnerPackage.mockResolvedValue(paketMitra);
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.discountBp).toBe(450);
    expect(ctx.discountFlat).toBe(2_000n);
    expect(ctx.tier?.slug).toBe("partner");
  });

  // Inti aturannya. Seorang mitra boleh saja juga punya akun reseller; kalau
  // keduanya dibaca, harga yang berlaku jadi bergantung pada mana yang
  // kebetulan lebih besar — mustahil dijelaskan ke mitra yang menandatangani
  // kesepakatan H2H dengan angka tertentu.
  it("mitra yang JUGA reseller → paket mitra menang, diskon TIDAK ditumpuk", async () => {
    user.findUnique.mockResolvedValue(
      asUser({ partner: { isActive: true }, reseller: resellerLengkap() }),
    );
    getPartnerPackage.mockResolvedValue(paketMitra);
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    // tier reseller Gold diskonnya 700; paket mitra 450. Yang menang mitra,
    // bukan yang lebih besar.
    expect(ctx.discountBp).toBe(450);
    expect(ctx.tier?.name).toBe("Mitra H2H");
  });

  // Dicabut admin lewat PartnerAccount.isActive. Harga harus kembali normal
  // seketika, tidak menunggu apa pun.
  it("mitra yang dinonaktifkan → jatuh ke jalur reseller biasa", async () => {
    user.findUnique.mockResolvedValue(
      asUser({ partner: { isActive: false }, reseller: resellerLengkap() }),
    );
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.discountBp).toBe(700);
    expect(ctx.tier?.name).toBe("Gold");
    expect(getPartnerPackage).not.toHaveBeenCalled();
  });

  it("mitra nonaktif tanpa akun reseller → NO_MEMBERSHIP", async () => {
    user.findUnique.mockResolvedValue(asUser({ partner: { isActive: false } }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Angka bonus yang tertinggal dari percobaan admin tidak boleh diam-diam
  // aktif — penjaga yang sama sudah berlaku untuk tier reseller.
  it("depositBonusBp 0 kalau benefit deposit_bonus tidak dicentang di paket mitra", async () => {
    user.findUnique.mockResolvedValue(asUser({ partner: { isActive: true } }));
    getPartnerPackage.mockResolvedValue({
      ...paketMitra,
      depositBonusPercent: 900,
      benefits: ["priority_badge"],
    });
    const { getMembershipContext } = await import("@/lib/membership/tier");
    expect((await getMembershipContext("user-1")).depositBonusBp).toBe(0);
  });

  // Mitra tidak pernah punya tanggal habis: biaya join sekali bayar, dan
  // pencabutan dilakukan lewat isActive, bukan lewat kedaluwarsa.
  it("expiresAt mitra selalu null", async () => {
    user.findUnique.mockResolvedValue(asUser({ partner: { isActive: true } }));
    getPartnerPackage.mockResolvedValue(paketMitra);
    const { getMembershipContext } = await import("@/lib/membership/tier");
    expect((await getMembershipContext("user-1")).expiresAt).toBeNull();
  });
});
