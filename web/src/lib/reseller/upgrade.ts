// Aturan harga upgrade paket reseller. MURNI: nol DB, nol React.
//
// Dipisah dari jalur pembelian supaya angkanya bisa diuji tanpa database dan
// supaya PRATINJAU di layar memakai fungsi yang sama persis dengan yang
// menagih. Pola yang sama dipakai lib/voucher/discount.ts — kalau pratinjau dan
// tagihan punya dua salinan perhitungan, cepat atau lambat yang dilihat pembeli
// berbeda dari yang dibayarnya.

export interface UpgradeQuote {
  /** Harga paket tujuan, apa adanya hari ini. */
  tierPrice: bigint;
  /** Kredit dari paket yang sedang dimiliki. */
  credit: bigint;
  /** Yang harus dibayar sebelum biaya metode & kode unik. Tidak pernah negatif. */
  payable: bigint;
}

/**
 * Menghitung selisih yang harus dibayar untuk naik ke sebuah paket.
 *
 * ===== KENAPA KREDITNYA DARI YANG DIBAYAR, BUKAN HARGA PAKET LAMA HARI INI =====
 *
 * Keduanya memberi hasil yang sama selama harga tidak pernah turun. Bedanya
 * baru muncul saat pemilik toko MENURUNKAN harga sebuah paket:
 *
 *   Beli Gold seharga 100rb. Belakangan Gold diturunkan jadi 80rb.
 *   Upgrade ke Platinum 150rb.
 *     - dasar "harga hari ini" -> kredit 80rb  -> bayar 70rb
 *     - dasar "yang dibayar"   -> kredit 100rb -> bayar 50rb
 *
 * Aturan pertama menghukum orang yang sudah membayar penuh karena ada promo
 * yang tidak pernah dia nikmati. Aturan kedua selalu mengkredit sebesar uang
 * yang benar-benar masuk ke kita — tidak pernah lebih, tidak pernah kurang.
 *
 * ===== KENAPA DIJEPIT DI NOL =====
 *
 * Kalau paket tujuan lebih murah dari yang sudah dibayar, selisihnya negatif.
 * Tagihan negatif di jalur pembayaran mana pun adalah uang yang mengalir ke
 * arah yang salah. Di sini hasilnya cuma "gratis", tidak pernah refund —
 * dan turun paket memang tidak diizinkan sama sekali (lihat canUpgradeTo).
 */
export function quoteUpgrade(input: {
  tierPrice: bigint;
  /** `ResellerAccount.tierPricePaid`; 0 untuk yang masih di paket gratis. */
  paidForCurrentTier: bigint;
}): UpgradeQuote {
  const credit = input.paidForCurrentTier < 0n ? 0n : input.paidForCurrentTier;
  // Kredit tidak pernah melebihi harga tujuan: yang dijepit kreditnya, bukan
  // hasil akhirnya, supaya angka yang ditampilkan ke pembeli tetap menjumlah
  // dengan benar (harga - kredit = bayar) alih-alih memperlihatkan kredit yang
  // lebih besar dari tagihannya sendiri.
  const applied = credit > input.tierPrice ? input.tierPrice : credit;
  return { tierPrice: input.tierPrice, credit: applied, payable: input.tierPrice - applied };
}

export type UpgradeBlock =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Boleh tidak naik ke paket ini?
 *
 * Paket bersifat SEUMUR HIDUP dan sekali bayar, jadi tidak ada perpanjangan dan
 * tidak ada penurunan. Yang tersisa cuma satu arah: naik ke paket yang lebih
 * mahal dari yang sudah dibayar.
 */
export function canUpgradeTo(input: {
  targetTierId: string;
  targetPrice: bigint;
  targetIsActive: boolean;
  currentTierId: string | null;
  paidForCurrentTier: bigint;
}): UpgradeBlock {
  if (!input.targetIsActive) {
    return { ok: false, reason: "Paket ini sedang tidak tersedia." };
  }
  if (input.currentTierId === input.targetTierId) {
    // Bukan galat pengguna — paketnya seumur hidup, jadi memang tidak ada yang
    // perlu dibeli lagi. Pesannya menjelaskan itu, bukan menyalahkan.
    return { ok: false, reason: "Kamu sudah memakai paket ini. Paket berlaku selamanya, tidak perlu diperpanjang." };
  }
  if (input.targetPrice <= input.paidForCurrentTier) {
    return {
      ok: false,
      reason: "Paket ini tidak lebih tinggi dari paket yang sudah kamu bayar. Penurunan paket tidak tersedia.",
    };
  }
  return { ok: true };
}
