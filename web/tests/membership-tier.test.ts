import { beforeEach, describe, expect, it, vi } from "vitest";

const resellerAccount = { findUnique: vi.fn() };
vi.mock("@/lib/db", () => ({ db: { resellerAccount } }));

beforeEach(() => {
  resellerAccount.findUnique.mockReset();
});

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
    expect(resellerAccount.findUnique).not.toHaveBeenCalled();
  });

  it("bukan reseller sama sekali → NO_MEMBERSHIP", async () => {
    resellerAccount.findUnique.mockResolvedValue(null);
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Paket gratis TIDAK diwujudkan sebagai baris tier apa pun - "tidak punya
  // tier" itulah paket gratisnya, dan jawabannya harga normal.
  it("reseller di paket GRATIS → NO_MEMBERSHIP (harga normal)", async () => {
    resellerAccount.findUnique.mockResolvedValue(resellerLengkap({ tier: null }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Sudah mengisi formulir tapi link aktivasinya belum diklik. Selama itu, dia
  // belum terbukti memegang inbox-nya sendiri.
  it("reseller yang BELUM aktivasi → NO_MEMBERSHIP walau punya paket", async () => {
    resellerAccount.findUnique.mockResolvedValue(resellerLengkap({ activatedAt: null }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  // Dicabut admin. Potongan harus berhenti SEKETIKA, bukan setelah sesinya habis.
  it("reseller yang dinonaktifkan admin → NO_MEMBERSHIP walau punya paket", async () => {
    resellerAccount.findUnique.mockResolvedValue(resellerLengkap({ isActive: false }));
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    expect(await getMembershipContext("user-1")).toEqual(NO_MEMBERSHIP);
  });

  it("reseller aktif berpaket → discountBp dari paket, benefits diparse dari Json", async () => {
    resellerAccount.findUnique.mockResolvedValue(resellerLengkap());
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
    resellerAccount.findUnique.mockResolvedValue(resellerLengkap());
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.expiresAt).toBeNull();
    expect(ctx.tier).not.toBeNull();
  });

  it("depositBonusBp 0 kalau benefit deposit_bonus TIDAK dicentang, walau angkanya > 0", async () => {
    // Skenario penting: admin sempat isi angka bonus lalu MATIKAN checkbox-nya
    // tanpa reset ke 0 - angka lama harus diam, tidak diam-diam aktif lagi.
    resellerAccount.findUnique.mockResolvedValue(
      resellerLengkap({
        tier: { ...tierGold, depositBonusPercent: 500, benefits: ["free_order_fee"] },
      }),
    );
    const { getMembershipContext } = await import("@/lib/membership/tier");
    expect((await getMembershipContext("user-1")).depositBonusBp).toBe(0);
  });

  it("mencari berdasarkan userId dan ikut mengambil paketnya", async () => {
    resellerAccount.findUnique.mockResolvedValue(resellerLengkap());
    const { getMembershipContext } = await import("@/lib/membership/tier");
    await getMembershipContext("user-1");
    const call = resellerAccount.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "user-1" });
    expect(call.include).toEqual({ tier: true });
  });
});
