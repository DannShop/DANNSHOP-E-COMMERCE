import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans/signature";
import { getTransactionStatus } from "@/lib/midtrans/client";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";
import { dispatchFulfillment, escalateOrder } from "@/lib/order/fulfillment";

const MAX_BODY_BYTES = 16_000;
const ALLOWED_HEADER_KEYS = ["content-type", "x-forwarded-for", "user-agent"];

function pickAllowedHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const key of ALLOWED_HEADER_KEYS) {
    const value = headers.get(key);
    if (value !== null) picked[key] = value;
  }
  return picked;
}

const notifSchema = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
});

async function handleOrderWebhook(
  order: { id: string; orderNumber: string; total: bigint },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
  const confirmed = await getTransactionStatus(notif.order_id);
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== order.total) {
    console.error("handleOrderWebhook: nominal settlement tidak cocok, escalate", {
      orderId: order.id, expected: order.total.toString(), received: confirmed.grossAmount,
    });
    await escalateOrder({
      orderId: order.id, orderNumber: order.orderNumber, toStatus: "NEEDS_REVIEW",
      note: "Nominal settlement tidak cocok dengan total order",
    });
    return "amount_mismatch";
  }

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
      } else {
        // Settlement "paid" asli datang tapi order sudah di status lain yang tidak PAID/PENDING_PAYMENT
        // (mis. EXPIRED karena delivery webhook sebelumnya sempat starved) - order ini TIDAK
        // otomatis diproses dari sini. Log supaya kejadian ini terlihat di production, bukan
        // hilang diam-diam (mirror pola log di handleDepositWebhook untuk kasus setara).
        console.error(
          "Webhook Midtrans order: settlement 'paid' datang setelah order tidak lagi PENDING_PAYMENT/PAID - perlu investigasi manual",
          { orderId: order.id, statusSaatIni: current?.status, eventKey: `midtrans:${notif.order_id}:${notif.transaction_status}`, order_id: notif.order_id },
        );
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
  deposit: { id: string; amount: bigint },
  notif: z.infer<typeof notifSchema>,
): Promise<string> {
  const confirmed = await getTransactionStatus(notif.order_id);
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== deposit.amount) {
    console.error("handleDepositWebhook: nominal settlement tidak cocok, saldo TIDAK dikredit", {
      depositId: deposit.id, expected: deposit.amount.toString(), received: confirmed.grossAmount,
    });
    return "amount_mismatch";
  }

  if (mapped === "paid") {
    let claimedCount = 0;
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.deposit.updateMany({
          where: { id: deposit.id, status: "PENDING" },
          data: { status: "PAID" },
        });
        claimedCount = claimed.count;
        if (claimed.count > 0) {
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
        }
      });
    } catch (e) {
      console.error("Webhook Midtrans deposit: gagal kredit saldo", { depositId: deposit.id, eventKey: `midtrans:${notif.order_id}`, error: e });
      throw e;
    }

    if (claimedCount === 0) {
      // Deposit sudah bukan PENDING lagi saat settlement "paid" ini masuk.
      // Cek status terkini: kalau sudah PAID, ini cuma notifikasi duplikat
      // (aman, no-op). Tapi kalau statusnya EXPIRED/FAILED, berarti dana
      // sudah masuk di Midtrans tapi saldo member TIDAK pernah dikredit -
      // kemungkinan race dengan job expire-deposit (klok expiry Midtrans
      // beda titik mulai karena chargeQris tidak kirim custom_expiry).
      const current = await db.deposit.findUnique({ where: { id: deposit.id }, select: { status: true } });
      if (current?.status !== "PAID") {
        console.error(
          "Webhook Midtrans deposit: settlement 'paid' datang setelah deposit tidak lagi PENDING - saldo BELUM dikredit, perlu investigasi manual",
          { depositId: deposit.id, statusSaatIni: current?.status, eventKey: `midtrans:${notif.order_id}` },
        );
        return "paid_but_not_pending";
      }
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
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body request terlalu besar" }, { status: 413 });
  }

  let notif: z.infer<typeof notifSchema>;
  try {
    const json = JSON.parse(rawBody);
    const parsed = notifSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
    notif = parsed.data;
  } catch {
    return NextResponse.json({ error: "Bukan JSON valid" }, { status: 400 });
  }

  // Signature diverifikasi PALING AWAL, sebelum WebhookEvent disentuh sama
  // sekali - request dengan signature salah tidak boleh bisa "mengunci"
  // eventKey (mencegah settlement asli terblokir dedup palsu) atau menulis
  // row apa pun (mencegah storage exhaustion oleh request tak terautentikasi).
  if (!verifyMidtransSignature(notif, process.env.MIDTRANS_SERVER_KEY!)) {
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
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
          headers: pickAllowedHeaders(request.headers),
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
