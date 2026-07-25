import { NextResponse } from "next/server";
import { z } from "zod";
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

export async function POST(request: Request) {
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
  const alreadyProcessed = await db.webhookEvent.findUnique({ where: { eventKey } });
  if (alreadyProcessed) return NextResponse.json({ ok: true, deduped: true });

  await db.webhookEvent.create({
    data: {
      source: "midtrans",
      externalRef: notif.order_id,
      eventKey,
      rawBody,
      headers: Object.fromEntries(request.headers),
    },
  });

  const markProcessed = (result: string) =>
    db.webhookEvent.update({ where: { eventKey }, data: { processedAt: new Date(), processResult: result } });

  if (!verifyMidtransSignature(notif, process.env.MIDTRANS_SERVER_KEY ?? "")) {
    await markProcessed("signature_invalid");
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
  }

  const order = await db.order.findUnique({ where: { orderNumber: notif.order_id } });
  if (!order) {
    await markProcessed("order_not_found");
    return NextResponse.json({ ok: true });
  }

  // Best practice Midtrans: konfirmasi ulang via GET status, jangan percaya body notifikasi mentah (spec §6)
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

  await markProcessed(mapped);
  return NextResponse.json({ ok: true });
}
