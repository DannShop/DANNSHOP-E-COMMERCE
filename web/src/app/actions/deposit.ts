"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { depositSchema } from "@/lib/validation/deposit";
import { createSnapTransaction } from "@/lib/midtrans/client";

const EXPIRY_MINUTES = 15;

export interface DepositResult {
  error?: string;
  depositId?: string;
  snapToken?: string;
}

export async function createDeposit(
  _prev: DepositResult | undefined,
  formData: FormData,
): Promise<DepositResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk isi saldo." };

  const parsed = depositSchema.safeParse({ amount: formData.get("amount") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const expiredAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);
  const deposit = await db.deposit.create({
    data: {
      userId: session.user.id,
      amount: parsed.data.amount,
      status: "PENDING",
      expiredAt,
    },
  });

  let snapToken: string;
  try {
    // deposit.id (cuid) dipakai langsung sebagai Midtrans order_id — Deposit
    // tidak punya nomor publik terpisah seperti Order.orderNumber, dan
    // createSnapTransaction generik terhadap format order_id.
    const snap = await createSnapTransaction({ orderId: deposit.id, grossAmount: Number(parsed.data.amount) });
    snapToken = snap.token;
    await db.deposit.update({
      where: { id: deposit.id },
      data: {
        rawResponse: { snapToken: snap.token, redirectUrl: snap.redirectUrl } as object,
      },
    });
  } catch (e) {
    console.error("Deposit: Midtrans Snap transaction gagal", { depositId: deposit.id, error: e });
    await db.deposit.update({ where: { id: deposit.id }, data: { status: "FAILED" } });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({
      data: { type: "expire-deposit", payload: { depositId: deposit.id }, runAt: expiredAt },
    });
  } catch (e) {
    console.error("Deposit: gagal schedule job expire-deposit", { depositId: deposit.id, error: e });
    // tidak throw — deposit tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  return { depositId: deposit.id, snapToken };
}
