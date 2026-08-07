import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans/signature";
import { getMidtransCreds } from "@/lib/payment/gateway-config";
import { settleFromMidtrans } from "@/lib/payment/settlement";

// Route ini murni urusan transport: verifikasi signature, dedup, lalu serahkan
// ke lib/payment/settlement.ts. Logika uangnya (kredit saldo, dispatch
// fulfillment, escalate nominal tidak cocok) sengaja TIDAK ada di sini karena
// dipakai bersama jalur lazy reconcile - lihat catatan di settlement.ts.

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

export async function POST(request: Request) {
  // Server key sekarang berasal dari Konfigurasi Payment di panel admin
  // (terenkripsi di DB) dengan env sebagai fallback - satu sumber yang sama
  // dengan yang dipakai saat charge, supaya signature webhook tidak pernah
  // diverifikasi memakai key yang berbeda dari key yang membuat transaksinya.
  const creds = await getMidtransCreds();
  if (!creds.serverKey) {
    console.error("Webhook Midtrans: server key belum diatur (panel admin maupun env)");
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
  if (!verifyMidtransSignature(notif, creds.serverKey)) {
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

  try {
    const result = await settleFromMidtrans(notif.order_id);
    await db.webhookEvent.update({
      where: { eventKey },
      data: { processedAt: new Date(), processResult: result },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Midtrans: gagal proses", { orderId: notif.order_id, eventKey, error: e });
    // JANGAN tandai processed di sini - biarkan processedAt tetap null supaya retry Midtrans bisa reprocess penuh
    return NextResponse.json({ error: "Gagal memproses notifikasi, akan dicoba lagi" }, { status: 500 });
  }
}
