import { randomInt } from "node:crypto";

// Hitung fee dari flat + persen (basis point, 100 = 1.00%). Dibawa ke basis
// integer 10_000 dulu (sejalan dengan pola applyMarkup di bulk-import.ts)
// supaya pembagian akhir konsisten tanpa floating point.
export function calculateFee(baseAmount: bigint, feeFlat: bigint, feePercentBp: number): bigint {
  if (feePercentBp < 0) throw new Error("feePercentBp tidak boleh negatif");
  const percentFee = (baseAmount * BigInt(feePercentBp)) / 10_000n;
  return feeFlat + percentFee;
}

// Batas atas range kode unik. Di atas ini kode unik mulai mengubah nominal
// tagihan secara signifikan (bukan lagi "kode" tapi kenaikan harga terselubung).
export const MAX_UNIQUE_CODE = 99_999;

// Kode unik untuk membantu pencocokan manual & menaikkan margin kecil. Range-nya
// diatur admin lewat Konfigurasi Payment (lib/payment/rules.ts), bukan lagi
// hardcode 1-999. Server-only (node:crypto) - JANGAN dipanggil dari client
// component.
export function generateUniqueCode(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error("Range kode unik harus bilangan bulat");
  }
  if (min < 1 || max > MAX_UNIQUE_CODE || min > max) {
    throw new Error(`Range kode unik tidak valid (harus 1..${MAX_UNIQUE_CODE} dan min <= max)`);
  }
  return randomInt(min, max + 1); // upper bound randomInt eksklusif -> +1 supaya max ikut terpakai
}

export function calculateTotal(baseAmount: bigint, fee: bigint, uniqueCode: number): bigint {
  return baseAmount + fee + BigInt(uniqueCode);
}
