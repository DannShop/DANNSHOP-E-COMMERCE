import { z } from "zod";

export const checkoutSchema = z.object({
  productItemId: z.string().min(1, "Item wajib dipilih"),
  buyerEmail: z.string().email("Email tidak valid"),
  buyerPhone: z.string().max(20, "Terlalu panjang").optional().transform((v) => (v === "" ? undefined : v)),
  target: z.record(z.string(), z.string().min(1, "Wajib diisi").max(255, "Terlalu panjang"))
    .refine((t) => Object.keys(t).length <= 10, "Terlalu banyak field"),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib dipilih"),
  // Kosong = tidak memakai kode promo. Sengaja ditransformasi ke `undefined`
  // (pola sama dengan buyerPhone di atas) supaya kolom yang dibiarkan kosong
  // tidak masuk ke jalur penilaian voucher dan menghasilkan penolakan "kode
  // tidak ditemukan" pada checkout yang memang tidak memakai promo.
  voucherCode: z
    .string()
    .max(24, "Kode promo terlalu panjang")
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
});

export function extractTargetFromFormData(formData: FormData): Record<string, string> {
  const target: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("target.") && typeof value === "string") {
      target[key.slice("target.".length)] = value;
    }
  }
  return target;
}
