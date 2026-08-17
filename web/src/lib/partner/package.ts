import { db } from "@/lib/db";
import { parsePartnerBenefits, type PartnerBenefitKey } from "@/lib/membership/benefits";

// Paket mitra H2H - SATU paket, bukan daftar bertingkat.
//
// ===== KENAPA PENGATURAN, BUKAN TABEL =====
//
// Reseller punya banyak paket bertingkat, jadi MembershipTier memang harus
// berupa tabel. Mitra tidak: hanya ada satu paket, dan "satu baris selamanya"
// yang disimpan sebagai tabel menuntut halaman CRUD, penanganan baris yang
// belum ada, dan pertanyaan "baris mana yang aktif" - semuanya untuk sesuatu
// yang jawabannya selalu satu. Disimpan sebagai satu baris SiteSetting berisi
// JSON, pola persis midtrans_config / storefront_appearance / pwa_settings.
//
// Konsekuensinya yang disengaja: NOL migrasi untuk mengubah isi paket.
//
// ===== HUBUNGANNYA DENGAN TIER RESELLER =====
//
// Tidak ada. Mitra TIDAK perlu punya akun reseller untuk mendapat harganya -
// sebelumnya justru begitu, dan itu memaksa mitra H2H mendaftar sebagai
// reseller eceran hanya demi diskon. Lihat getMembershipContext().

export const PARTNER_PACKAGE_KEY = "partner_package";

export interface PartnerPackage {
  /** Biaya join sekali bayar. 0 = gratis, tapi tetap lewat alur pembayaran. */
  joinPrice: bigint;
  /** Basis point (100 = 1,00%), satuan sama dengan MembershipTier.discountPercent. */
  discountPercent: number;
  /** Potongan FLAT rupiah, HANYA untuk produk MANUAL. Menggantikan persen di situ. */
  discountFlatManual: bigint;
  /** Basis point bonus saldo tiap isi saldo. Berlaku hanya jika benefit deposit_bonus dicentang. */
  depositBonusPercent: number;
  benefits: PartnerBenefitKey[];
  /** false = pendaftaran mitra baru ditutup. Mitra yang sudah aktif tidak terpengaruh. */
  isOpen: boolean;
}

/**
 * Bawaan saat admin belum pernah menyimpan apa pun.
 *
 * `isOpen: false` DENGAN SENGAJA: paket yang belum pernah diisi berarti
 * harganya belum ditentukan, dan membuka pendaftaran dengan biaya join Rp0
 * yang tidak disadari admin jauh lebih mahal daripada formulir yang tertutup
 * sampai sengaja dibuka.
 */
export const DEFAULT_PARTNER_PACKAGE: PartnerPackage = {
  joinPrice: 0n,
  discountPercent: 0,
  discountFlatManual: 0n,
  depositBonusPercent: 0,
  benefits: [],
  isOpen: false,
};

/** BigInt tidak selamat melewati JSON - disimpan sebagai string, dibaca balik di sini. */
function readBigInt(raw: unknown): bigint {
  if (typeof raw === "bigint") return raw >= 0n ? raw : 0n;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0 ? BigInt(Math.round(raw)) : 0n;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return BigInt(raw.trim());
  return 0n;
}

function readBp(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Dijepit 100% supaya salah ketik di panel tidak pernah menghasilkan harga
  // negatif. Lantai memberPrice di effectivePrice() sudah menjaga hal yang sama
  // dari sisi lain, tapi dua penjaga di sini murah dan menutup jalur berbeda.
  return Math.min(Math.round(n), 10_000);
}

export function parsePartnerPackage(raw: unknown): PartnerPackage {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    joinPrice: readBigInt(o.joinPrice),
    discountPercent: readBp(o.discountPercent),
    discountFlatManual: readBigInt(o.discountFlatManual),
    depositBonusPercent: readBp(o.depositBonusPercent),
    benefits: parsePartnerBenefits(o.benefits),
    isOpen: o.isOpen === true,
  };
}

export async function getPartnerPackage(): Promise<PartnerPackage> {
  // Jatuh ke bawaan kalau apa pun bermasalah, bukan melempar: pembaca terbesar
  // fungsi ini adalah jalur harga API mitra, dan gangguan DB sesaat di sana
  // tidak boleh membuat seluruh price list gagal - harga normal (tanpa diskon)
  // jauh lebih baik daripada tidak ada jawaban sama sekali.
  try {
    const row = await db.siteSetting.findUnique({ where: { key: PARTNER_PACKAGE_KEY } });
    if (!row) return DEFAULT_PARTNER_PACKAGE;
    return parsePartnerPackage(JSON.parse(row.value));
  } catch {
    return DEFAULT_PARTNER_PACKAGE;
  }
}

export async function savePartnerPackage(pkg: PartnerPackage): Promise<void> {
  const value = JSON.stringify({
    ...pkg,
    // BigInt harus jadi string sebelum JSON.stringify - kalau tidak, seluruh
    // penyimpanan melempar TypeError dan admin melihat galat tanpa sebab jelas.
    joinPrice: pkg.joinPrice.toString(),
    discountFlatManual: pkg.discountFlatManual.toString(),
  });
  await db.siteSetting.upsert({
    where: { key: PARTNER_PACKAGE_KEY },
    update: { value },
    create: { key: PARTNER_PACKAGE_KEY, value },
  });
}
