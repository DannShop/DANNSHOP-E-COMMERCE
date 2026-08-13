import { authenticatePartner, readPartnerBody } from "@/lib/partner/auth";
import { createPartnerOrder } from "@/lib/partner/order";
import { PARTNER_RC, partnerError, partnerJson, rcForStatus, toPartnerStatus } from "@/lib/partner/response";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/v1/transaction — membuat transaksi baru (debit saldo partner).
// sign = md5(username + apiKey + ref_id)
export async function POST(request: Request) {
  const parsed = await readPartnerBody(request);
  if (!parsed.ok) return parsed.response;

  const refId = typeof parsed.body.ref_id === "string" ? parsed.body.ref_id.trim() : "";
  const sku = typeof parsed.body.sku === "string" ? parsed.body.sku.trim() : "";
  const customerNo = typeof parsed.body.customer_no === "string" ? parsed.body.customer_no.trim() : "";

  // ref_id divalidasi SEBELUM autentikasi karena ia adalah salt tanda tangannya:
  // tanpa ref_id tidak ada tanda tangan yang bisa diverifikasi, dan menjawab
  // "signature salah" untuk request yang sebenarnya kekurangan field akan
  // mengirim partner memburu bug di tempat yang keliru.
  if (!refId) {
    return partnerError(PARTNER_RC.INVALID_REQUEST, "Field `ref_id` wajib diisi dan unik per transaksi.", 400);
  }
  if (refId.length > 100) {
    return partnerError(PARTNER_RC.INVALID_REQUEST, "`ref_id` maksimal 100 karakter.", 400);
  }
  if (!sku || !customerNo) {
    return partnerError(PARTNER_RC.INVALID_REQUEST, "Field `sku` dan `customer_no` wajib diisi.", 400);
  }

  const auth = await authenticatePartner(request, parsed.body, refId, { limit: 120, windowMs: 60_000 });
  if (!auth.ok) return auth.response;

  try {
    const result = await createPartnerOrder({ partner: auth.partner, refId, sku, customerNo });
    if (!result.ok) {
      return partnerError(result.rc, result.message, result.httpStatus, { ref_id: refId });
    }

    const status = toPartnerStatus(result.order.status);
    const latest = await db.orderFulfillment.findFirst({
      where: { orderId: result.order.id },
      orderBy: { attemptNo: "desc" },
      select: { sn: true, status: true, message: true },
    });

    return partnerJson({
      rc: rcForStatus(status),
      message:
        latest?.message ??
        (status === "Sukses" ? "Transaksi berhasil" : status === "Gagal" ? "Transaksi gagal" : "Transaksi sedang diproses"),
      ref_id: refId,
      order_number: result.order.orderNumber,
      sku,
      customer_no: customerNo,
      product_name: result.order.productName,
      item_name: result.order.itemName,
      price: Number(result.order.sellingPrice),
      status,
      sn: latest?.status === "SUCCESS" ? (latest.sn ?? null) : null,
      balance: Number(result.balance),
      // Menandai balasan yang berasal dari ref_id yang sudah pernah diproses.
      // Partner bisa memakainya untuk membedakan "retry saya berhasil disatukan"
      // dari "transaksi baru dibuat" saat merekonsiliasi log mereka sendiri.
      replayed: result.replayed,
    });
  } catch (e) {
    console.error("POST /api/v1/transaction: gagal tak terduga", {
      partnerId: auth.partner.id,
      refId,
      error: e,
    });
    // Sengaja TIDAK menyebut "transaksi gagal": pada titik ini order bisa saja
    // sudah dibuat dan saldonya sudah terdebit. Partner harus mengecek status,
    // bukan menganggapnya batal lalu mengirim ulang dengan ref_id baru — itu
    // yang menghasilkan transaksi dobel.
    return partnerError(
      PARTNER_RC.SYSTEM_ERROR,
      "Terjadi kesalahan sistem. Status transaksi ini BELUM PASTI — cek lewat /api/v1/transaction/status dengan ref_id yang sama, jangan kirim ulang dengan ref_id baru.",
      500,
      { ref_id: refId },
    );
  }
}
