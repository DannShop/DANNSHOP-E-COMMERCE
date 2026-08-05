"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { depositSchema } from "@/lib/validation/deposit";
import { chargeByMethodCode } from "@/lib/midtrans/client";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";

const EXPIRY_MINUTES = 15;

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

  const parsed = depositSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const methodCode = String(formData.get("paymentMethod") ?? "");
  const method = await db.paymentMethodConfig.findUnique({ where: { code: methodCode } });
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  const fee = calculateFee(parsed.data.amount, method.feeFlat, method.feePercent);
  const uniqueCode = generateUniqueCode();
  const totalPaid = calculateTotal(parsed.data.amount, fee, uniqueCode);

  const expiredAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);
  const deposit = await db.deposit.create({
    data: {
      userId: session.user.id,
      amount: parsed.data.amount, // TETAP nominal murni yang akan dikreditkan - JANGAN diisi totalPaid
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
    const { actions } = await chargeByMethodCode(method.code, deposit.id, Number(totalPaid));
    await db.deposit.update({ where: { id: deposit.id }, data: { rawResponse: actions as object } });
  } catch (e) {
    console.error("Deposit: charge Midtrans gagal", { depositId: deposit.id, method: method.code, error: e });
    await db.deposit.update({ where: { id: deposit.id }, data: { status: "FAILED" } });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({ data: { type: "expire-deposit", payload: { depositId: deposit.id }, runAt: expiredAt } });
  } catch (e) {
    console.error("Deposit: gagal schedule job expire-deposit", { depositId: deposit.id, error: e });
    // tidak throw — deposit tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  return { depositId: deposit.id };
}
