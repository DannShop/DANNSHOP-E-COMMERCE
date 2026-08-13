import { db } from "@/lib/db";
import { authenticatePartner, readPartnerBody } from "@/lib/partner/auth";
import { PARTNER_RC, partnerError, partnerJson, rcForStatus, toPartnerStatus } from "@/lib/partner/response";

export const dynamic = "force-dynamic";

// POST /api/v1/transaction/status — cek status transaksi yang sudah dikirim.
// sign = md5(username + apiKey + ref_id)  ← salt sama dengan endpoint transaksi
export async function POST(request: Request) {
  const parsed = await readPartnerBody(request);
  if (!parsed.ok) return parsed.response;

  const refId = typeof parsed.body.ref_id === "string" ? parsed.body.ref_id.trim() : "";
  if (!refId) {
    return partnerError(PARTNER_RC.INVALID_REQUEST, "Field `ref_id` wajib diisi.", 400);
  }

  // Limit lebih longgar daripada endpoint transaksi: partner tanpa callback
  // memang harus polling, dan mencekiknya di sini akan membuat mereka kehilangan
  // status transaksi yang sudah mereka bayar.
  const auth = await authenticatePartner(request, parsed.body, refId, { limit: 240, windowMs: 60_000 });
  if (!auth.ok) return auth.response;

  try {
    const order = await db.order.findFirst({
      // Selalu dibatasi partnerId milik pemanggil — tanpa itu, ref_id yang
      // ditebak-tebak bisa membocorkan transaksi partner lain.
      where: { partnerId: auth.partner.id, partnerRefId: refId },
      include: { fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 } },
    });
    if (!order) {
      return partnerError(
        PARTNER_RC.TRANSACTION_NOT_FOUND,
        `Transaksi dengan ref_id "${refId}" tidak ditemukan.`,
        404,
        { ref_id: refId },
      );
    }

    const status = toPartnerStatus(order.status);
    const latest = order.fulfillments[0];
    return partnerJson({
      rc: rcForStatus(status),
      message:
        latest?.message ??
        (status === "Sukses" ? "Transaksi berhasil" : status === "Gagal" ? "Transaksi gagal" : "Transaksi sedang diproses"),
      ref_id: refId,
      order_number: order.orderNumber,
      sku: order.productItemId,
      product_name: order.productName,
      item_name: order.itemName,
      price: Number(order.sellingPrice),
      status,
      sn: latest?.status === "SUCCESS" ? (latest.sn ?? null) : order.manualSn,
      created_at: order.createdAt.toISOString(),
      updated_at: order.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error("POST /api/v1/transaction/status: gagal baca transaksi", {
      partnerId: auth.partner.id,
      refId,
      error: e,
    });
    return partnerError(PARTNER_RC.SYSTEM_ERROR, "Gagal membaca status transaksi, coba lagi.", 500);
  }
}
