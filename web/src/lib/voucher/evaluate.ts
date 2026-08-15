import { db } from "@/lib/db";
import { isValidVoucherCode, normalizeVoucherCode } from "@/lib/voucher/code";
import { buildTargetKey } from "@/lib/voucher/target-key";
import { checkVoucher, type VoucherCheck, type VoucherRules } from "@/lib/voucher/discount";
import { countVoucherUsage } from "@/lib/voucher/usage";

// Menyatukan pembacaan DB dengan aturan murni di discount.ts.
//
// SATU-SATUNYA jalan menilai voucher. Dipakai pratinjau di checkout DAN
// pembuatan order yang sebenarnya, supaya angka yang ditampilkan ke pembeli
// mustahil berbeda dari angka yang ditagihkan kepadanya.

export interface EvaluateInput {
  rawCode: string;
  /** Harga item setelah flash sale & diskon tier - keluaran effectivePrice(). */
  price: bigint;
  categoryId: string;
  productId: string;
  isFlashActive: boolean;
  target: Record<string, string>;
  userId: string | null;
  now: Date;
}

export type EvaluateResult =
  | { ok: true; voucherId: string; code: string; discount: bigint; targetKey: string }
  | { ok: false; message: string };

const TIDAK_DIKENAL = "Kode promo tidak ditemukan.";

export async function evaluateVoucher(input: EvaluateInput): Promise<EvaluateResult> {
  const code = normalizeVoucherCode(input.rawCode);
  if (!isValidVoucherCode(code)) return { ok: false, message: TIDAK_DIKENAL };

  const voucher = await db.voucher.findUnique({
    where: { code },
    include: { categories: { select: { id: true } }, products: { select: { id: true } } },
  });
  // Pesan yang sama persis untuk "tidak ada" dan "formatnya salah". Membedakan
  // keduanya memberi tahu penebak kode mana yang sudah mendekati benar.
  if (!voucher) return { ok: false, message: TIDAK_DIKENAL };

  const targetKey = buildTargetKey(input.target);
  const usage = await countVoucherUsage(voucher.id, targetKey);

  const rules: VoucherRules = {
    discountType: voucher.discountType,
    percentBp: voucher.percentBp,
    amount: voucher.amount,
    minSpend: voucher.minSpend,
    quota: voucher.quota,
    perTargetLimit: voucher.perTargetLimit,
    startAt: voucher.startAt,
    endAt: voucher.endAt,
    isActive: voucher.isActive,
    allowFlashSale: voucher.allowFlashSale,
    allowGuest: voucher.allowGuest,
    categoryIds: voucher.categories.map((c) => c.id),
    productIds: voucher.products.map((p) => p.id),
  };

  const check: VoucherCheck = checkVoucher(rules, {
    price: input.price,
    categoryId: input.categoryId,
    productId: input.productId,
    isFlashActive: input.isFlashActive,
    isGuest: input.userId === null,
    now: input.now,
    usedTotal: usage.total,
    usedByTarget: usage.byTarget,
  });

  if (!check.ok) return { ok: false, message: check.message };
  return { ok: true, voucherId: voucher.id, code, discount: check.discount, targetKey };
}
