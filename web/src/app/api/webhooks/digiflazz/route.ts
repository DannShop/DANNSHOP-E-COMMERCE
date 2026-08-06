import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { DigiflazzAdapter, type DigiflazzCredentials } from "@/lib/providers/digiflazz";
import { applyFulfillmentResult } from "@/lib/order/fulfillment";

const MAX_BODY_BYTES = 16_000;

// Callback status transaksi dari Digiflazz - pelengkap job polling recheck-fulfillment
// (bukan pengganti; job itu tetap jalan sebagai jaring pengaman kalau callback ini
// tidak pernah sampai). Kalau webhookSecret belum diisi admin di /admin/providers,
// DigiflazzAdapter.parseCallback SELALU mengembalikan verified:false (lihat
// lib/providers/digiflazz.ts) - endpoint ini otomatis menolak semua request sampai
// secret-nya benar-benar dikonfigurasi (fail-closed, bukan fail-open).
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Body request terlalu besar" }, { status: 413 });
  }

  const config = await db.providerConfig.findUnique({ where: { key: "DIGIFLAZZ" } });
  if (!config || typeof config.credentials !== "string" || config.credentials.length === 0) {
    console.error("Webhook Digiflazz: provider belum dikonfigurasi kredensial");
    return NextResponse.json({ error: "Provider belum dikonfigurasi" }, { status: 503 });
  }

  const creds = decryptJson<DigiflazzCredentials>(config.credentials);
  const adapter = new DigiflazzAdapter(creds);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  // parseCallback melakukan parse body + verifikasi signature (HMAC-SHA1) sekaligus -
  // verifikasi terjadi SEBELUM baris apa pun di database disentuh, sama seperti pola
  // webhook Midtrans (lihat api/webhooks/midtrans/route.ts).
  const callback = adapter.parseCallback({ rawBody, headers });
  if (!callback || !callback.verified) {
    return NextResponse.json({ error: "Signature tidak valid" }, { status: 403 });
  }

  const eventKey = `digiflazz:${callback.refId}:${callback.status}`;

  let webhookEvent = await db.webhookEvent.findUnique({ where: { eventKey } });
  if (webhookEvent?.processedAt) {
    return NextResponse.json({ ok: true, deduped: true });
  }
  if (!webhookEvent) {
    try {
      webhookEvent = await db.webhookEvent.create({
        data: { source: "digiflazz", externalRef: callback.refId, eventKey, rawBody, headers },
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
    // ourRefId (bukan orderId) yang jadi kunci pencocokan - satu order bisa punya
    // lebih dari satu OrderFulfillment (percobaan ulang), tiap percobaan ref_id-nya beda.
    const fulfillment = await db.orderFulfillment.findUnique({ where: { ourRefId: callback.refId } });
    if (!fulfillment) {
      await markProcessed("fulfillment_not_found");
      return NextResponse.json({ ok: true });
    }

    // applyFulfillmentResult() persis fungsi yang sama dipakai job recheck-fulfillment -
    // jaminan hasilnya konsisten lewat jalur mana pun status ini datang.
    await applyFulfillmentResult(fulfillment.id, {
      refId: callback.refId,
      status: callback.status,
      sn: callback.sn,
      message: callback.message,
      costPrice: null, // callback tidak membawa info harga modal, cuma status pengiriman
      raw: callback.raw,
    });
    await markProcessed(callback.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Digiflazz: gagal proses", { refId: callback.refId, eventKey, error: e });
    // JANGAN markProcessed di sini - biarkan processedAt tetap null supaya Digiflazz
    // bisa mengirim ulang callback ini dan diproses penuh (pola sama seperti Midtrans).
    return NextResponse.json({ error: "Gagal memproses notifikasi, akan dicoba lagi" }, { status: 500 });
  }
}
