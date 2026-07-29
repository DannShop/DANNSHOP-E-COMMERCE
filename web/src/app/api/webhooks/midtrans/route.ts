import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans/signature";
import { getTransactionStatus } from "@/lib/midtrans/client";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";
import { dispatchFulfillment } from "@/lib/order/fulfillment";

const notifSchema = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
});

async function handleOrderWebhook(
  order: { id: string },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
  const confirmed = await getTransactionStatus(notif.order_id);
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid") {
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "PAID" },
    });
    if (claimed.count > 0) {
      await db.orderPayment.update({
        where: { orderId: order.id },
        data: { status: "PAID", rawResponse: confirmed.raw as object },
      });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Midtrans settlement" },
      });
      await dispatchFulfillment(order.id);
    } else {
      // Order sudah bukan PENDING_PAYMENT lagi - kemungkinan webhook retry
      // setelah percobaan sebelumnya sempat klaim PAID tapi belum sempat
      // dispatch. dispatchFulfillment aman dipanggil ulang (klaim atomik
      // PAID->PROCESSING di dalamnya, no-op kalau sudah PROCESSING/lain).
      const current = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (current?.status === "PAID") {
        await dispatchFulfillment(order.id);
      }
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: newStatus },
    });
    if (claimed.count > 0) {
      await db.orderPayment.update({ where: { orderId: order.id }, data: { status: newStatus } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: newStatus, note: "Midtrans notification" },
      });
    }
  }

  return mapped;
}

async function handleDepositWebhook(
  deposit: { id: string },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
  const confirmed = await getTransactionStatus(notif.order_id);
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid") {
    const claimed = await db.deposit.updateMany({
      where: { id: deposit.id, status: "PENDING" },
      data: { status: "PAID" },
    });
    if (claimed.count > 0) {
      await db.$transaction(async (tx) => {
        const full = await tx.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
        const wallet = await tx.wallet.update({
          where: { userId: full.userId },
          data: { balance: { increment: full.amount } },
        });
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "DEPOSIT",
            amount: full.amount,
            balanceAfter: wallet.balance,
            referenceType: "deposit",
            referenceId: full.id,
            idempotencyKey: `deposit:${full.id}`,
          },
        });
      });
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    await db.deposit.updateMany({ where: { id: deposit.id, status: "PENDING" }, data: { status: newStatus } });
  }

  return mapped;
}

export async function POST(request: Request) {
  if (!process.env.MIDTRANS_SERVER_KEY) {
    console.error("Webhook Midtrans: MIDTRANS_SERVER_KEY tidak di-set di environment");
    return NextResponse.json({ error: "Konfigurasi server tidak lengkap" }, { status: 500 });
  }

  const rawBody = await request.text();

  let notif: z.infer<typeof notifSchema>;
  try {
    const json = JSON.parse(rawBody);
    const parsed = notifSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
    notif = parsed.data;
  } catch {
    return NextResponse.json({ error: "Bukan JSON valid" }, { status: 400 });
  }

  const eventKey = `midtrans:${notif.order_id}:${notif.transaction_status}`;

  let webhookEvent = await db.webhookEvent.findUnique({ where: { eventKey } });
  if (webhookEvent?.processedAt) {
    return NextResponse.json({ ok: true, deduped: true });
  }
  if (!webhookEvent) {
    try {
      webhookEvent = await db.webhookEvent.create({
        data: {
          source: "midtrans",
          externalRef: notif.order_id,
          eventKey,
          rawBody,
          headers: Object.fromEntries(request.headers),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // race: request lain barusan insert row yang sama - ambil ulang, lanjut proses row itu
        webhookEvent = await db.webhookEvent.findUnique({ where: { eventKey } });
        if (webhookEvent?.processedAt) return NextResponse.json({ ok: true, deduped: true });
      } else {
        throw e;
      }
    }
  }

  const markProcessed = (result: string) =>
    db.webhookEvent.update({ where: { eventKey }, data: { processedAt: new Date(), processResult: result } });

  if (!verifyMidtransSignature(notif, process.env.MIDTRANS_SERVER_KEY!)) {
    await markProcessed("signature_invalid");
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
  }

  try {
    const order = await db.order.findUnique({ where: { orderNumber: notif.order_id } });
    if (order) {
      const result = await handleOrderWebhook(order, notif);
      await markProcessed(result);
      return NextResponse.json({ ok: true });
    }

    const deposit = await db.deposit.findUnique({ where: { id: notif.order_id } });
    if (deposit) {
      const result = await handleDepositWebhook(deposit, notif);
      await markProcessed(result);
      return NextResponse.json({ ok: true });
    }

    await markProcessed("order_not_found");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Midtrans: gagal proses", { orderId: notif.order_id, eventKey, error: e });
    // JANGAN markProcessed di sini - biarkan processedAt tetap null supaya retry Midtrans bisa reprocess penuh
    return NextResponse.json({ error: "Gagal memproses notifikasi, akan dicoba lagi" }, { status: 500 });
  }
}
