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
  // Kapan paket ini habis - murni untuk TAMPILAN. Sejak paket reseller bersifat
  // sekali bayar seumur hidup, nilainya SELALU null; field-nya dipertahankan
  // supaya pemanggil yang menampilkannya tidak perlu diubah, dan supaya masa
  // berlaku bisa dihidupkan lagi nanti tanpa menyentuh bentuk data ini.
  // Keputusan bisnis (diskon/fee/dsb.) tidak pernah membacanya.
  expiresAt: Date | null;
}

export const NO_MEMBERSHIP: MembershipContext = {
  tier: null,
  discountBp: 0,
  depositBonusBp: 0,
  benefits: [],
  expiresAt: null,
};

// Tier aktif = paket berbayar pada ResellerAccount orang ini.
//
// ===== KENAPA DIBACA DARI SINI, BUKAN DARI UserMembership =====
//
// Program membership berlangganan digantikan program reseller (keputusan
// Wildan 2026-08-17), dan paket reseller bersifat SEKALI BAYAR, SEUMUR HIDUP.
// Tanpa masa berlaku, seorang reseller punya tepat satu paket pada satu waktu -
// tidak ada lagi pertanyaan "baris mana yang menang" yang dulu dijawab dengan
// membandingkan `expiresAt` terjauh.
//
// Fungsi ini SENGAJA mempertahankan bentuk keluarannya. Ada 16 pemanggil -
// checkout, deposit, voucher, harga produk, price list mitra, panel admin - dan
// semuanya terus bekerja tanpa disentuh. Yang berubah hanya dari mana jawabannya
// diambil.
//
// TIGA keadaan yang semuanya berarti "harga normal", dan semuanya disengaja:
//   1. Bukan reseller sama sekali.
//   2. Reseller yang BELUM mengaktifkan akunnya lewat link email.
//   3. Reseller aktif yang masih di paket GRATIS (tierId null).
// Ketiganya jatuh ke NO_MEMBERSHIP, jadi "gratis" tidak perlu diwujudkan
// sebagai baris tier apa pun.
//
// Paket yang sudah dinonaktifkan admin (isActive: false) TETAP dihormati kalau
// resellernya sudah terlanjur membelinya - isActive cuma mengunci PEMBELIAN
// BARU, bukan mencabut sesuatu yang sudah dibayar. Yang mencabut hak adalah
// `ResellerAccount.isActive`, dan itu keputusan terhadap orangnya.
export async function getMembershipContext(userId: string | null): Promise<MembershipContext> {
  if (!userId) return NO_MEMBERSHIP;

  const reseller = await db.resellerAccount.findUnique({
    where: { userId },
    include: { tier: true },
  });
  if (!reseller || !reseller.isActive || !reseller.activatedAt || !reseller.tier) {
    return NO_MEMBERSHIP;
  }

  const benefits = parseBenefits(reseller.tier.benefits);
  return {
    tier: {
      id: reseller.tier.id,
      name: reseller.tier.name,
      slug: reseller.tier.slug,
      badgeColor: reseller.tier.badgeColor,
    },
    discountBp: reseller.tier.discountPercent,
    depositBonusBp: hasBenefit(benefits, "deposit_bonus") ? reseller.tier.depositBonusPercent : 0,
    benefits,
    // null = SEUMUR HIDUP, bukan "tidak punya paket". Pembacanya cuma tampilan,
    // dan tampilan yang benar untuk paket tanpa tenggat memang tidak menyebut
    // tanggal apa pun.
    expiresAt: null,
  };
}
