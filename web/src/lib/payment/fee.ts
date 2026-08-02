import { randomInt } from "node:crypto";

// Hitung fee dari flat + persen (basis point, 100 = 1.00%). Dibawa ke basis
// integer 10_000 dulu (sejalan dengan pola applyMarkup di bulk-import.ts)
// supaya pembagian akhir konsisten tanpa floating point.
export function calculateFee(baseAmount: bigint, feeFlat: bigint, feePercentBp: number): bigint {
  if (feePercentBp < 0) throw new Error("feePercentBp tidak boleh negatif");
  const percentFee = (baseAmount * BigInt(feePercentBp)) / 10_000n;
  return feeFlat + percentFee;
}

// Kode unik Rp1-999 untuk membantu pencocokan manual & menaikkan margin
// kecil. Server-only (node:crypto) - JANGAN dipanggil dari client component.
export function generateUniqueCode(): number {
  return randomInt(1, 1000); // upper bound eksklusif -> hasil 1..999
}

export function calculateTotal(baseAmount: bigint, fee: bigint, uniqueCode: number): bigint {
  return baseAmount + fee + BigInt(uniqueCode);
}
