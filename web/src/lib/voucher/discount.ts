import type { VoucherDiscountType } from "@prisma/client";

// Aturan kelayakan & besar potongan voucher. MURNI - tidak menyentuh DB, jadi
// setiap cabang penolakan bisa diuji langsung, dan pratinjau di checkout memakai
// fungsi yang sama persis dengan yang menentukan tagihan sebenarnya.
//
// Ini penting: kalau pratinjau dan pemotongan sebenarnya dihitung dua kali oleh
// dua potong kode berbeda, cepat atau lambat keduanya akan berbeda - dan yang
// melihatnya pertama kali adalah pembeli yang tagihannya tidak sesuai dengan
// yang barusan ditampilkan kepadanya.

export interface VoucherRules {
  discountType: VoucherDiscountType;
  percentBp: number;
  amount: bigint;
  minSpend: bigint;
  quota: number;
  perTargetLimit: number;
  startAt: Date | null;
  endAt: Date | null;
  isActive: boolean;
  allowFlashSale: boolean;
  allowGuest: boolean;
  /** Kosong = berlaku untuk semua kategori. */
  categoryIds: string[];
  /** Kosong = berlaku untuk semua produk. */
  productIds: string[];
}

export interface VoucherContext {
  /** Harga item setelah flash sale & diskon tier - yaitu keluaran effectivePrice(). */
  price: bigint;
  categoryId: string;
  productId: string;
  isFlashActive: boolean;
  isGuest: boolean;
  now: Date;
  /** Sudah terpakai berapa kali secara keseluruhan (turunan dari status order). */
  usedTotal: number;
  /** Sudah terpakai berapa kali oleh nomor tujuan ini. */
  usedByTarget: number;
}

export type VoucherRejection =
  | "TIDAK_AKTIF"
  | "BELUM_MULAI"
  | "SUDAH_BERAKHIR"
  | "KUOTA_HABIS"
  | "BATAS_TUJUAN"
  | "MINIMAL_BELANJA"
  | "BUKAN_UNTUK_TAMU"
  | "TIDAK_BERLAKU_DI_PRODUK"
  | "TIDAK_BERLAKU_SAAT_FLASH";

export type VoucherCheck =
  | { ok: true; discount: bigint }
  | { ok: false; reason: VoucherRejection; message: string };

// Pesan ditulis untuk PEMBELI, bukan untuk log. Masing-masing menjelaskan apa
// yang bisa dilakukan orangnya, bukan sekadar menyatakan penolakan.
const MESSAGES: Record<VoucherRejection, string> = {
  TIDAK_AKTIF: "Kode promo ini sudah tidak berlaku.",
  BELUM_MULAI: "Kode promo ini belum bisa dipakai.",
  SUDAH_BERAKHIR: "Masa berlaku kode promo ini sudah habis.",
  KUOTA_HABIS: "Kuota kode promo ini sudah habis dipakai.",
  BATAS_TUJUAN: "Kode promo ini sudah pernah dipakai untuk tujuan yang sama.",
  MINIMAL_BELANJA: "Belanjaanmu belum memenuhi minimal untuk kode promo ini.",
  BUKAN_UNTUK_TAMU: "Kode promo ini khusus member. Login dulu untuk memakainya.",
  TIDAK_BERLAKU_DI_PRODUK: "Kode promo ini tidak berlaku untuk produk ini.",
  TIDAK_BERLAKU_SAAT_FLASH: "Kode promo tidak bisa digabung dengan harga Flash Sale.",
};

function reject(reason: VoucherRejection): VoucherCheck {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/**
 * Besar potongan sebelum dijepit ke harga.
 *
 * Mode PERCENT memakai basis 10.000 (sama dengan calculateFee & applyMarkup di
 * repo ini) supaya seluruh perhitungan uang memakai basis integer yang sama dan
 * tidak ada satu pun titik yang diam-diam memakai floating point.
 */
export function rawDiscount(rules: VoucherRules, price: bigint): bigint {
  if (rules.discountType === "FIXED") return rules.amount;
  const percent = (price * BigInt(rules.percentBp)) / 10_000n;
  // `amount` berperan sebagai BATAS ATAS di mode PERCENT. 0 = tanpa batas.
  if (rules.amount > 0n && percent > rules.amount) return rules.amount;
  return percent;
}

/**
 * Memutuskan boleh atau tidak, sekaligus berapa potongannya.
 *
 * Urutan pemeriksaan dipilih supaya pesan yang diterima pembeli adalah yang
 * paling bisa ditindaklanjuti: keadaan voucher itu sendiri lebih dulu (mati,
 * kedaluwarsa, habis), baru keadaan pesanannya (produk salah, belanja kurang).
 * Memberitahu "minimal belanja kurang" untuk voucher yang sebenarnya sudah
 * kedaluwarsa hanya membuat orang menambah belanjaan lalu ditolak lagi.
 */
export function checkVoucher(rules: VoucherRules, ctx: VoucherContext): VoucherCheck {
  if (!rules.isActive) return reject("TIDAK_AKTIF");
  if (rules.startAt && ctx.now < rules.startAt) return reject("BELUM_MULAI");
  if (rules.endAt && ctx.now > rules.endAt) return reject("SUDAH_BERAKHIR");

  if (rules.quota > 0 && ctx.usedTotal >= rules.quota) return reject("KUOTA_HABIS");
  if (rules.perTargetLimit > 0 && ctx.usedByTarget >= rules.perTargetLimit) {
    return reject("BATAS_TUJUAN");
  }

  if (ctx.isGuest && !rules.allowGuest) return reject("BUKAN_UNTUK_TAMU");
  if (ctx.isFlashActive && !rules.allowFlashSale) return reject("TIDAK_BERLAKU_SAAT_FLASH");

  // Pembatas KOSONG berarti "berlaku untuk semua", bukan "tidak berlaku untuk
  // apa pun". Kesalahan membaca ini akan membuat setiap voucher tanpa pembatas
  // ditolak di mana-mana.
  const cocokKategori =
    rules.categoryIds.length === 0 || rules.categoryIds.includes(ctx.categoryId);
  const cocokProduk = rules.productIds.length === 0 || rules.productIds.includes(ctx.productId);
  // Dua pembatas berbeda digabung dengan DAN: voucher yang menyebut kategori
  // "Game" sekaligus produk "Mobile Legends" berarti kedua syarat harus
  // terpenuhi, bukan salah satunya.
  if (!cocokKategori || !cocokProduk) return reject("TIDAK_BERLAKU_DI_PRODUK");

  if (ctx.price < rules.minSpend) return reject("MINIMAL_BELANJA");

  const discount = rawDiscount(rules, ctx.price);

  // DIJEPIT KE HARGA. Voucher nominal Rp50.000 pada item Rp10.000 tidak boleh
  // menghasilkan tagihan negatif - yang di jalur bayar-saldo berarti MENAMBAH
  // saldo pembeli, dan di jalur Midtrans berarti charge gagal dengan pesan yang
  // tidak bisa dimengerti siapa pun.
  const dijepit = discount > ctx.price ? ctx.price : discount;
  if (dijepit <= 0n) return reject("MINIMAL_BELANJA");

  return { ok: true, discount: dijepit };
}
