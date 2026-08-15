"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { effectivePrice, isFlashActive } from "@/lib/pricing/effective-price";
import { getMembershipContext } from "@/lib/membership/tier";
import { evaluateVoucher } from "@/lib/voucher/evaluate";
import { extractTargetFromFormData } from "@/lib/validation/checkout";

export type VoucherPreview =
  | { ok: true; code: string; discount: string; message: string }
  | { ok: false; message: string };

const previewSchema = z.object({
  productItemId: z.string().min(1),
  voucherCode: z.string().min(1, "Masukkan kode promo dulu.").max(24, "Kode promo terlalu panjang"),
  target: z.record(z.string(), z.string()),
});

/**
 * Pratinjau kode promo sebelum pembeli menekan Bayar.
 *
 * Harga dihitung ULANG DI SERVER dari database, bukan diterima dari client.
 * Kalau harganya dikirim dari browser, siapa pun bisa mengaku itemnya seharga
 * sepuluh juta supaya voucher persentase memberi potongan sebesar itu - dan
 * karena pratinjau ini memakai fungsi yang sama dengan checkout, angka palsunya
 * akan terlihat konsisten sampai tagihannya keluar.
 *
 * DIBATASI LAJU. Tanpa itu endpoint ini adalah alat tebak kode promo yang
 * sempurna: gratis, cepat, dan jawabannya biner.
 */
export async function previewVoucher(formData: FormData): Promise<VoucherPreview> {
  const parsed = previewSchema.safeParse({
    productItemId: formData.get("productItemId"),
    voucherCode: formData.get("voucherCode"),
    target: extractTargetFromFormData(formData),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const ip = extractIp(await headers());
  const limit = await checkRateLimit(`voucher-preview:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return { ok: false, message: "Terlalu banyak percobaan kode promo. Tunggu sebentar." };
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [item, membership] = await Promise.all([
    db.productItem.findUnique({
      where: { id: parsed.data.productItemId, isActive: true },
      include: { product: { select: { id: true, categoryId: true, isActive: true } } },
    }),
    getMembershipContext(userId),
  ]);
  if (!item || !item.product.isActive) return { ok: false, message: "Produk tidak ditemukan." };

  const now = new Date();
  const price = effectivePrice(item, { discountBp: membership.discountBp, now });

  const hasil = await evaluateVoucher({
    rawCode: parsed.data.voucherCode,
    price,
    categoryId: item.product.categoryId,
    productId: item.product.id,
    isFlashActive: isFlashActive(item, now),
    target: parsed.data.target,
    userId,
    now,
  });

  if (!hasil.ok) return { ok: false, message: hasil.message };
  return {
    ok: true,
    code: hasil.code,
    // BigInt tidak bisa melintasi batas Server Action, jadi dikirim sebagai
    // string dan diubah lagi di client hanya untuk ditampilkan.
    discount: hasil.discount.toString(),
    message: "Kode promo dipakai.",
  };
}
