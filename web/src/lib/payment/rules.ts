import { db } from "@/lib/db";

// Aturan kode unik & biaya admin - disimpan sebagai JSON biasa di SiteSetting
// (BUKAN terenkripsi seperti gateway-config.ts: ini bukan rahasia, cuma
// pengaturan bisnis). Satu row, satu key.
//
// Kode unik dan fee bisa dimatikan/dinyalakan TERPISAH untuk order dan deposit,
// karena keduanya punya alasan bisnis berbeda: kode unik membantu pencocokan
// manual, fee menutup biaya gateway. Ada toko yang mau fee cuma di deposit
// (biar harga produk terlihat bulat), ada yang sebaliknya.

export const PAYMENT_RULES_KEY = "payment_rules";

export interface PaymentRules {
  uniqueCodeOrder: boolean;
  uniqueCodeDeposit: boolean;
  feeOrder: boolean;
  feeDeposit: boolean;
  uniqueCodeMin: number;
  uniqueCodeMax: number;
}

// Default = perilaku sistem SEBELUM fitur ini ada (kode unik 1-999 dan fee
// aktif di order maupun deposit). Dipilih supaya deploy pertama tidak mengubah
// nominal tagihan siapa pun sebelum admin sempat menyentuh panel.
export const DEFAULT_PAYMENT_RULES: PaymentRules = {
  uniqueCodeOrder: true,
  uniqueCodeDeposit: true,
  feeOrder: true,
  feeDeposit: true,
  uniqueCodeMin: 1,
  uniqueCodeMax: 999,
};

// Batas bawah expiry pembayaran. Bukan angka karangan: dokumen Midtrans
// menyatakan scheduler expiry mereka hanya andal untuk durasi >= 15 menit,
// jadi custom_expiry di bawah itu berisiko transaksi tidak pernah benar-benar
// dikadaluarsakan di sisi Midtrans - persis kondisi berbahaya yang bikin
// customer masih bisa membayar VA yang di sistem kita sudah EXPIRED.
export const MIN_EXPIRY_MINUTES = 15;
// 24 jam. Aman di bawah batas maksimum SEMUA channel yang dipakai (GoPay 7
// hari, ShopeePay/QRIS 5 hari, VA lebih panjang lagi), jadi satu batas seragam
// ini tidak akan pernah ditolak gateway.
export const MAX_EXPIRY_MINUTES = 1440;

function isValidRules(value: unknown): value is PaymentRules {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uniqueCodeOrder === "boolean" &&
    typeof v.uniqueCodeDeposit === "boolean" &&
    typeof v.feeOrder === "boolean" &&
    typeof v.feeDeposit === "boolean" &&
    typeof v.uniqueCodeMin === "number" &&
    typeof v.uniqueCodeMax === "number"
  );
}

export async function getPaymentRules(): Promise<PaymentRules> {
  const row = await db.siteSetting.findUnique({ where: { key: PAYMENT_RULES_KEY } });
  if (!row) return DEFAULT_PAYMENT_RULES;
  try {
    const parsed: unknown = JSON.parse(row.value);
    // JSON korup / bentuk lama tidak boleh mematikan checkout - jatuh ke default
    // yang sama persis dengan perilaku lama, bukan melempar error ke user.
    if (!isValidRules(parsed)) return DEFAULT_PAYMENT_RULES;
    return parsed;
  } catch {
    return DEFAULT_PAYMENT_RULES;
  }
}

export async function savePaymentRules(rules: PaymentRules): Promise<void> {
  const value = JSON.stringify(rules);
  await db.siteSetting.upsert({
    where: { key: PAYMENT_RULES_KEY },
    update: { value },
    create: { key: PAYMENT_RULES_KEY, value },
  });
}
