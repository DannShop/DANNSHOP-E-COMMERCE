import { beforeEach, describe, expect, it, vi } from "vitest";

const userMembership = { findFirst: vi.fn() };
vi.mock("@/lib/db", () => ({ db: { userMembership } }));

beforeEach(() => {
  userMembership.findFirst.mockReset();
});

describe("getMembershipContext", () => {
  it("userId null (guest) → NO_MEMBERSHIP tanpa query DB", async () => {
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext(null);
    expect(ctx).toEqual(NO_MEMBERSHIP);
    expect(userMembership.findFirst).not.toHaveBeenCalled();
  });

  it("tidak ada membership aktif → NO_MEMBERSHIP", async () => {
    userMembership.findFirst.mockResolvedValue(null);
    const { getMembershipContext, NO_MEMBERSHIP } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx).toEqual(NO_MEMBERSHIP);
  });

  it("ada tier aktif → discountBp dari tier, benefits diparse dari Json", async () => {
    const expiresAt = new Date("2026-09-01T00:00:00Z");
    userMembership.findFirst.mockResolvedValue({
      expiresAt,
      tier: {
        id: "tier-gold", name: "Gold", slug: "gold", badgeColor: "#eab308",
        discountPercent: 700, depositBonusPercent: 200,
        benefits: ["free_order_fee", "deposit_bonus"],
      },
    });
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.tier?.name).toBe("Gold");
    expect(ctx.discountBp).toBe(700);
    expect(ctx.depositBonusBp).toBe(200);
    expect(ctx.benefits).toEqual(["free_order_fee", "deposit_bonus"]);
    expect(ctx.expiresAt).toBe(expiresAt);
  });

  it("depositBonusBp 0 kalau benefit deposit_bonus TIDAK dicentang, walau depositBonusPercent tier > 0", async () => {
    // Skenario penting: admin sempat isi angka bonus lalu MATIKAN checkbox-nya
    // tanpa reset ke 0 - angka lama harus diam, tidak diam-diam aktif lagi.
    userMembership.findFirst.mockResolvedValue({
      expiresAt: new Date(),
      tier: {
        id: "tier-silver", name: "Silver", slug: "silver", badgeColor: "#9ca3af",
        discountPercent: 400, depositBonusPercent: 500, // angka tetap ada di DB...
        benefits: ["free_order_fee"], // ...tapi deposit_bonus TIDAK dicentang
      },
    });
    const { getMembershipContext } = await import("@/lib/membership/tier");
    const ctx = await getMembershipContext("user-1");
    expect(ctx.depositBonusBp).toBe(0);
  });

  it("tier aktif dipilih dari expiresAt terbesar (query findFirst orderBy expiresAt desc)", async () => {
    userMembership.findFirst.mockResolvedValue({
      expiresAt: new Date(), tier: { id: "t", name: "T", slug: "t", badgeColor: "#000", discountPercent: 100, depositBonusPercent: 0, benefits: [] },
    });
    const { getMembershipContext } = await import("@/lib/membership/tier");
    await getMembershipContext("user-1");
    const call = userMembership.findFirst.mock.calls[0][0];
    expect(call.orderBy).toEqual({ expiresAt: "desc" });
    expect(call.where.userId).toBe("user-1");
    expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
  });
});
