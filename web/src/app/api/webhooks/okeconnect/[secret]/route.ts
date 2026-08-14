import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson, safeCompare } from "@/lib/crypto";
import { OkeConnectAdapter, type OkeConnectCredentials } from "@/lib/providers/okeconnect";
import { getAdapter } from "@/lib/providers/registry";
import { applyFulfillmentResult } from "@/lib/order/fulfillment";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { extractIp } from "@/lib/rate-limit";

// Callback status transaksi dari OkeConnect.
//
// ===================================================================
// BACA INI SEBELUM MENGUBAH APA PUN DI FILE INI
// ===================================================================
// OkeConnect TIDAK MENANDATANGANI callback-nya. Tidak ada signature, tidak ada
// secret di dalam payload, tidak ada apa pun yang bisa membuktikan pengirimnya
// benar-benar OkeConnect. Bentuknya cuma:
//
//     GET /api/webhooks/okeconnect/<secret>?refid=114&message=<kalimat>
//
// Artinya siapa pun yang tahu URL ini bisa mengarang `message` berisi "SUKSES.
// SN: xxx" dan — kalau kalimat itu dipercaya — order akan ditandai selesai
// padahal barangnya tidak pernah dikirim.
//
// KARENA ITU: isi `message` TIDAK PERNAH dipakai untuk menetapkan status.
// Callback hanya dipakai sebagai PEMICU untuk memanggil checkStatus (`check=1`)
// ke OkeConnect, dan JAWABAN CHECKSTATUS ITULAH yang menentukan. Ini pola yang
// sama persis dengan webhook Midtrans (docs/04 §2.6 langkah 6: "body webhook
// mentah TIDAK PERNAH langsung dipercaya").
//
// Jangan pernah "menyederhanakan" file ini dengan meneruskan callback.status
// langsung ke applyFulfillmentResult. Itu menghapus satu-satunya hal yang
// membuat endpoint ini aman.
//
// Beda mendasar lain dari webhook Digiflazz (yang ber-HMAC): di sana gerbangnya
// `callback.verified`. Di sini `verified` SELALU false dan memang tidak bisa
// dijadikan gerbang — yang menjaga justru langkah verifikasi ulang di bawah.
// ===================================================================

/**
 * IP asal callback yang diharapkan — sama dengan IP `h2h.okeconnect.com`
 * (dikonfirmasi lewat DNS, 2026-08-14), dan tertulis sebagai "IP Center" di
 * dashboard OkeConnect.
 *
 * SENGAJA HANYA DICATAT, TIDAK MEMBLOKIR. Belum ada konfirmasi dari CS bahwa
 * callback benar-benar dikirim dari alamat yang sama dengan alamat tujuan API.
 * Kalau ternyata berbeda dan ini dipasang sebagai pemblokir, callback yang sah
 * akan dibuang diam-diam — kegagalan yang jauh lebih sulit dilacak daripada
 * callback palsu (yang toh sudah ditangkis oleh verifikasi ulang checkStatus).
 * Ubah jadi pemblokir HANYA setelah log di bawah membuktikan alamatnya konsisten.
 */
const EXPECTED_CALLBACK_IP = "103.139.245.61";

export async function GET(request: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;

  const config = await db.providerConfig.findUnique({ where: { key: "OKECONNECT" } });
  if (!config || typeof config.credentials !== "string" || config.credentials.length === 0) {
    console.error("Callback OkeConnect: provider belum dikonfigurasi kredensial");
    return NextResponse.json({ error: "Provider belum dikonfigurasi" }, { status: 503 });
  }

  let creds: OkeConnectCredentials;
  try {
    creds = decryptJson<OkeConnectCredentials>(config.credentials);
  } catch (e) {
    console.error("Callback OkeConnect: kredensial gagal didekripsi", e);
    return NextResponse.json({ error: "Kredensial provider rusak" }, { status: 503 });
  }

  // Fail-closed: selama segmen acaknya belum dibuat admin, endpoint ini menolak
  // semua request — bukan menerima semuanya.
  if (!creds.callbackSecret) {
    console.error("Callback OkeConnect: callbackSecret belum dibuat di /admin/providers");
    return NextResponse.json({ error: "Callback belum dikonfigurasi" }, { status: 503 });
  }
  if (!safeCompare(creds.callbackSecret, secret)) {
    return NextResponse.json({ error: "Tidak dikenali" }, { status: 404 });
  }

  const ip = extractIp(request.headers);
  if (ip !== EXPECTED_CALLBACK_IP) {
    // Dicatat, TIDAK ditolak — lihat catatan di EXPECTED_CALLBACK_IP.
    console.warn("Callback OkeConnect: IP asal di luar dugaan", { ip, expected: EXPECTED_CALLBACK_IP });
  }

  const url = new URL(request.url);
  const adapter = new OkeConnectAdapter(creds);
  const callback = adapter.parseCallback({ rawBody: url.search, headers: {} });
  if (!callback) {
    return NextResponse.json({ error: "Parameter callback tidak lengkap" }, { status: 400 });
  }

  // eventKey memakai refid SAJA, bukan refid+status seperti Digiflazz.
  //
  // Statusnya di sini berasal dari kalimat yang dikarang pengirim, jadi
  // memasukkannya ke kunci idempotency berarti pengirim bisa memaksa pemrosesan
  // berulang hanya dengan mengubah kata di dalam `message`.
  const eventKey = `okeconnect:${callback.refId}`;
  const rawBody = url.search;

  let webhookEvent = await db.webhookEvent.findUnique({ where: { eventKey } });
  if (webhookEvent?.processedAt) {
    return NextResponse.json({ ok: true, deduped: true });
  }
  if (!webhookEvent) {
    try {
      webhookEvent = await db.webhookEvent.create({
        data: { source: "okeconnect", externalRef: callback.refId, eventKey, rawBody, headers: { ip } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // Balapan dengan request kembar — ambil ulang barisnya lalu lanjut.
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
    // ourRefId, bukan orderId: satu order bisa punya beberapa percobaan
    // pengiriman, dan tiap percobaan punya refId sendiri.
    const fulfillment = await db.orderFulfillment.findUnique({ where: { ourRefId: callback.refId } });
    if (!fulfillment) {
      // Termasuk kasus refid karangan dari pihak luar. Ditandai selesai supaya
      // tidak menumpuk sebagai antrean yang seolah perlu ditangani.
      await markProcessed("fulfillment_not_found");
      return NextResponse.json({ ok: true });
    }
    if (fulfillment.provider !== "OKECONNECT") {
      // Refid milik provider lain tidak boleh diputuskan lewat jalur ini.
      await markProcessed("provider_mismatch");
      return NextResponse.json({ ok: true });
    }
    if (fulfillment.status === "SUCCESS" || fulfillment.status === "FAILED") {
      await markProcessed("already_final");
      return NextResponse.json({ ok: true, deduped: true });
    }

    // ---- INTI KEAMANAN ENDPOINT INI --------------------------------------
    // Status ditanyakan ULANG ke OkeConnect, bukan dibaca dari `message`.
    // Nomor tujuan direkonstruksi dengan buildCustomerNo() — fungsi yang sama
    // dengan yang dipakai saat mengirim transaksi dan saat job recheck berjalan,
    // supaya ketiganya tidak pernah memakai bentuk tujuan yang berbeda.
    const order = await db.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });
    const item = await db.productItem.findUniqueOrThrow({
      where: { id: order.productItemId! },
      include: { product: true },
    });
    const target = buildCustomerNo(
      item.product.inputFields as { name: string }[],
      order.target as Record<string, string>,
    );

    // allowInactive: ini operasi baca status untuk transaksi yang SUDAH terkirim.
    // Kill-switch provider tidak boleh membuat order yang sudah dibayar macet.
    const liveAdapter = await getAdapter("OKECONNECT", db, { allowInactive: true });
    const verified = await liveAdapter.checkStatus({
      skuCode: fulfillment.providerSkuCode,
      target,
      refId: fulfillment.ourRefId,
      context: { orderId: order.id, orderNumber: order.orderNumber, fulfillmentId: fulfillment.id },
    });

    await applyFulfillmentResult(fulfillment.id, verified);
    await markProcessed(`verified:${verified.status}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Callback OkeConnect: gagal proses", { refId: callback.refId, eventKey, error: e });
    // processedAt SENGAJA dibiarkan null supaya percobaan kirim ulang dari
    // OkeConnect (dokumentasinya menyebut retry sampai 3x) bisa diproses penuh.
    // Job recheck-fulfillment tetap jadi jaring pengaman kalau semua retry gagal.
    return NextResponse.json({ error: "Gagal memproses, akan dicoba lagi" }, { status: 500 });
  }
}
