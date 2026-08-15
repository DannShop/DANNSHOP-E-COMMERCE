/**
 * Penyesuaian harga jual otomatis saat harga modal provider berubah.
 *
 * Seluruh keputusannya murni — tanpa database, tanpa waktu, tanpa acak — supaya
 * bisa dibuktikan lewat tes. Yang diputuskan di sini menyentuh angka yang
 * dibayar pembeli, jadi "kelihatannya jalan" tidak cukup.
 *
 * DUA MODE, dan bedanya bukan selera:
 *
 *  - `FOLLOW_DELTA` — harga jual bergeser SEBESAR pergeseran modal. Margin tiap
 *    item dipertahankan apa adanya, termasuk yang sudah disetel manual supaya
 *    bersaing. Item yang modalnya tidak berubah TIDAK disentuh sama sekali.
 *  - `FORMULA` — harga jual selalu dihitung ulang dari `modal × (1 + margin)`.
 *    Seluruh kategori jadi seragam, dengan konsekuensi yang harus disadari:
 *    harga yang pernah disetel manual akan tertimpa, bahkan ketika modalnya
 *    tidak bergerak sedikit pun.
 *
 * Mode dipilih PER KATEGORI karena karakternya memang berbeda: pulsa marginnya
 * tipis dan sering di-tune tangan, voucher game lebih cocok diseragamkan.
 */

export type AutoMarginMode = "OFF" | "FOLLOW_DELTA" | "FORMULA";

export interface AutoMarginRule {
  mode: AutoMarginMode;
  /** Margin untuk mode FORMULA, dalam basis poin (1% = 100). */
  marginBp: number;
  /** Kelipatan pembulatan ke ATAS. 0 atau 1 = tanpa pembulatan. */
  roundTo: number;
  /**
   * Batas perubahan modal yang dianggap wajar, dalam basis poin.
   * Di atas ini harga TIDAK diubah — lihat catatan penjaga di bawah.
   */
  maxJumpBp: number;
}

export interface PriceRecalcInput {
  oldCost: bigint;
  newCost: bigint;
  currentSelling: bigint;
  /** Harga flash yang sedang tersimpan, kalau ada. */
  flashPrice: bigint | null;
}

export type PriceRecalcResult =
  | { action: "unchanged" }
  | { action: "skipped"; reason: string }
  | { action: "update"; newSelling: bigint };

/**
 * Bulatkan KE ATAS ke kelipatan terdekat.
 *
 * Selalu ke atas, tidak pernah ke bawah atau ke terdekat: pembulatan ke bawah
 * memakan margin yang baru saja dihitung, dan memakannya lagi di setiap sync
 * berikutnya. Dengan pembulatan ke atas, kesalahannya selalu berpihak ke penjual
 * dan besarnya tidak pernah melebihi satu kelipatan.
 */
export function roundUpTo(value: bigint, multiple: bigint): bigint {
  if (multiple <= 1n) return value;
  const remainder = value % multiple;
  return remainder === 0n ? value : value + (multiple - remainder);
}

export function recalcSellingPrice(rule: AutoMarginRule, input: PriceRecalcInput): PriceRecalcResult {
  if (rule.mode === "OFF") return { action: "unchanged" };

  const { oldCost, newCost, currentSelling, flashPrice } = input;

  // PENJAGA 1 — lonjakan modal yang tidak wajar.
  //
  // Price list provider adalah data dari luar yang tidak kita kendalikan, dan
  // sudah terbukti bisa aneh (kode ganda, harga negatif di kategori tagihan).
  // Kalau modal sebuah SKU tiba-tiba 10× lipat karena salah kirim, mengikutinya
  // berarti menaikkan harga jual 10× juga — di seluruh katalog, tanpa satu pun
  // manusia melihatnya. Menahan harga lama selalu bisa diperbaiki besok; harga
  // ngawur yang sempat tayang tidak.
  //
  // Modal lama nol dilewatkan dari pemeriksaan ini: tidak ada persentase yang
  // bermakna terhadap nol, dan itu keadaan wajar untuk SKU yang baru dipetakan.
  if (oldCost > 0n) {
    const diff = newCost > oldCost ? newCost - oldCost : oldCost - newCost;
    const jumpBp = (diff * 10_000n) / oldCost;
    if (jumpBp > BigInt(rule.maxJumpBp)) {
      return {
        action: "skipped",
        reason: `Perubahan modal ${(Number(jumpBp) / 100).toFixed(1)}% melewati batas wajar — harga lama dipertahankan, periksa manual.`,
      };
    }
  }

  let target: bigint;
  if (rule.mode === "FOLLOW_DELTA") {
    // Modal tidak bergerak berarti tidak ada yang perlu diikuti. Ini yang
    // membuat harga hasil tuning manual aman di mode ini.
    if (newCost === oldCost) return { action: "unchanged" };
    target = currentSelling + (newCost - oldCost);
  } else {
    target = (newCost * BigInt(10_000 + rule.marginBp)) / 10_000n;
  }

  target = roundUpTo(target, BigInt(rule.roundTo));

  if (target === currentSelling) return { action: "unchanged" };

  // PENJAGA 2 — hasilnya tidak boleh di bawah modal.
  //
  // Jaring terakhir, dan bukan teoretis: pada margin yang sudah tipis,
  // FOLLOW_DELTA bisa menghasilkan harga di bawah modal begitu modalnya melompat
  // lebih besar daripada marginnya. Sama seperti guard di selectFulfillmentSku,
  // yang dijaga di sini adalah "jangan pernah menjual rugi tanpa disengaja".
  if (target <= newCost) {
    return {
      action: "skipped",
      reason: `Harga hasil hitungan (${target}) tidak di atas modal (${newCost}) — perlu disetel manual.`,
    };
  }

  // PENJAGA 3 — jangan merusak flash sale yang sudah diatur admin.
  //
  // Aturan yang sama dipakai markup massal (computeBulkMarkup): flash sale yang
  // tidak lagi lebih murah dari harga normal bukan cuma tidak berguna, dia
  // membingungkan — pembeli melihat label diskon pada harga yang justru lebih
  // tinggi. Diam-diam mengubahnya lebih buruk lagi.
  if (flashPrice !== null && flashPrice >= target) {
    return {
      action: "skipped",
      reason: "Bentrok flash sale aktif (harga flash >= harga jual baru) — atur flash sale-nya dulu.",
    };
  }

  return { action: "update", newSelling: target };
}
