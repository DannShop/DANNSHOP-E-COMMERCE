"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { depositSchema } from "@/lib/validation/deposit";
import { chargeByMethodCode } from "@/lib/midtrans/client";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";
import { getPaymentRules } from "@/lib/payment/rules";
import { getMidtransCreds } from "@/lib/payment/gateway-config";
import { reportChargeFailure } from "@/lib/payment/charge-failure";
import { getMembershipContext } from "@/lib/membership/tier";
import { hasBenefit } from "@/lib/membership/benefits";
import { requireActiveAccount } from "@/lib/account/user-status";

export interface DepositResult {
  error?: string;
  depositId?: string;
}

export async function createDeposit(
  _prev: DepositResult | undefined,
  formData: FormData,
): Promise<DepositResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk isi saldo." };

  const blocked = await requireActiveAccount(session.user.id, session.user.updatedAt);
  if (blocked) return { error: blocked };

  const parsed = depositSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const methodCode = String(formData.get("paymentMethod") ?? "");
  const [method, rules, membership] = await Promise.all([
    db.paymentMethodConfig.findUnique({ where: { code: methodCode } }),
    getPaymentRules(),
    getMembershipContext(session.user.id),
  ]);
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  // Fee/kode unik bisa dimatikan admin (aturan global) ATAU benefit tier
  // member (per user) - lihat alasan dua sumber di actions/checkout.ts.
  // Kalau mati nilainya 0 tapi tetap lewat calculateTotal() yang sama, supaya
  // totalPaid yang dicocokkan webhook saat settlement selalu dihitung lewat
  // satu jalur.
  const freeFeeBenefit = hasBenefit(membership.benefits, "free_deposit_fee");
  const noUniqueCodeBenefit = hasBenefit(membership.benefits, "no_unique_code_deposit");
  const fee = rules.feeDeposit && !freeFeeBenefit ? calculateFee(parsed.data.amount, method.feeFlat, method.feePercent) : 0n;
  const uniqueCode =
    rules.uniqueCodeDeposit && !noUniqueCodeBenefit ? generateUniqueCode(rules.uniqueCodeMin, rules.uniqueCodeMax) : 0;
  const totalPaid = calculateTotal(parsed.data.amount, fee, uniqueCode);

  // Bonus saldo dari benefit tier "deposit_bonus" - dihitung & DISNAPSHOT di
  // sini (bukan dibaca ulang saat settlement), lihat catatan lengkap di
  // Deposit.bonusAmount pada schema.prisma. depositBonusBp sudah 0 kalau
  // benefit tidak dicentang (lihat getMembershipContext), jadi tidak perlu
  // cek hasBenefit terpisah di sini.
  const bonusAmount = calculateFee(parsed.data.amount, 0n, membership.depositBonusBp);

  // Expiry per metode, diatur admin (lihat PaymentMethodConfig.expiryMinutes).
  const expiryMinutes = method.expiryMinutes;
  const expiredAt = new Date(Date.now() + expiryMinutes * 60_000);
  const deposit = await db.deposit.create({
    data: {
      userId: session.user.id,
      amount: parsed.data.amount, // TETAP nominal murni yang akan dikreditkan - JANGAN diisi totalPaid
      bonusAmount,
      fee,
      uniqueCode,
      totalPaid,
      paymentMethod: method.code,
      status: "PENDING",
      expiredAt,
    },
  });

  try {
    // deposit.id (cuid) dipakai langsung sebagai Midtrans order_id - Deposit
    // tidak punya nomor publik terpisah seperti Order.orderNumber.
    const creds = await getMidtransCreds();
    const { actions } = await chargeByMethodCode(method.code, deposit.id, Number(totalPaid), expiryMinutes, creds);
    await db.deposit.update({ where: { id: deposit.id }, data: { rawResponse: actions as object } });
  } catch (e) {
    const { failure, buyerMessage } = reportChargeFailure(
      { scope: "deposit", refId: deposit.id, method: method.code },
      e,
    );
    // rawResponse di jalur SUKSES berisi `actions`; di jalur gagal berisi
    // alasan kegagalan. Dibedakan lewat status baris (FAILED) - sama seperti
    // OrderPayment di checkout.
    await db.deposit.update({
      where: { id: deposit.id },
      data: { status: "FAILED", rawResponse: failure },
    });
    return { error: buyerMessage };
  }

  try {
    await db.job.create({ data: { type: "expire-deposit", payload: { depositId: deposit.id }, runAt: expiredAt } });
  } catch (e) {
    console.error("Deposit: gagal schedule job expire-deposit", { depositId: deposit.id, error: e });
    // tidak throw — deposit tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  return { depositId: deposit.id };
}
