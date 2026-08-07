import { db } from "@/lib/db";
import { parseBenefits, hasBenefit, type BenefitKey } from "@/lib/membership/benefits";

// Konteks tier seorang user pada satu titik waktu - satu-satunya bentuk yang
// boleh dibaca checkout/deposit/harga. JANGAN baca UserMembership/
// MembershipTier mentah di tempat lain; semua keputusan bisnis (diskon, fee,
// kode unik, bonus deposit) harus lewat sini supaya cuma ada satu jalur yang
// bisa salah menafsirkan "tier aktif" (pola sama dengan effectivePrice()
// sebagai satu-satunya pembaca sellingPrice/memberPrice/flashPrice mentah).
export interface MembershipContext {
  tier: { id: string; name: string; slug: string; badgeColor: string } | null;
  discountBp: number; // 0 kalau tidak ada tier aktif
  depositBonusBp: number; // 0 kalau tidak ada tier aktif ATAU benefit deposit_bonus tidak dicentang
  benefits: BenefitKey[];
  // Kapan tier aktif ini habis - murni untuk TAMPILAN (halaman /membership &
  // /account menunjukkan "aktif sampai kapan" sebelum user memutuskan
  // perpanjang/ganti tier). Keputusan bisnis (diskon/fee/dsb.) tidak pernah
  // butuh field ini, cukup discountBp/depositBonusBp/benefits di atas.
  expiresAt: Date | null;
}

export const NO_MEMBERSHIP: MembershipContext = {
  tier: null,
  discountBp: 0,
  depositBonusBp: 0,
  benefits: [],
  expiresAt: null,
};

// Tier aktif = UserMembership dengan expiresAt > now yang PALING BARU
// (expiresAt terbesar). Kalau ada beberapa baris aktif tumpang tindih (mis.
// beli tier baru sebelum tier lama benar-benar habis), yang expiresAt-nya
// paling jauh ke depan yang menang - konsisten dengan cara purchaseTier()
// memutuskan perpanjang vs beli baru.
//
// Tier yang sudah dinonaktifkan admin (isActive: false) TETAP dihormati kalau
// member sudah pernah membelinya dan belum expired - isActive cuma mengunci
// PEMBELIAN BARU, bukan mencabut benefit yang sudah dibayar customer.
export async function getMembershipContext(userId: string | null): Promise<MembershipContext> {
  if (!userId) return NO_MEMBERSHIP;

  const membership = await db.userMembership.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
    include: { tier: true },
  });
  if (!membership) return NO_MEMBERSHIP;

  const benefits = parseBenefits(membership.tier.benefits);
  return {
    tier: {
      id: membership.tier.id,
      name: membership.tier.name,
      slug: membership.tier.slug,
      badgeColor: membership.tier.badgeColor,
    },
    discountBp: membership.tier.discountPercent,
    depositBonusBp: hasBenefit(benefits, "deposit_bonus") ? membership.tier.depositBonusPercent : 0,
    benefits,
    expiresAt: membership.expiresAt,
  };
}
