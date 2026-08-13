import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { rcForStatus, toPartnerStatus } from "@/lib/partner/response";
import { signCallbackBody } from "@/lib/partner/signature";

const CALLBACK_TIMEOUT_MS = 15_000;

/**
 * Menjadwalkan pemberitahuan ke partner bahwa sebuah transaksi sudah final.
 *
 * Lewat tabel Job, bukan fetch langsung di tempat kejadian, karena tiga alasan
 * yang semuanya sudah pernah menggigit di repo ini: (1) server partner yang
 * lambat/mati tidak boleh menahan atau menggagalkan penyelesaian order kita,
 * (2) kegagalan kirim harus otomatis di-retry dengan backoff — mesin itu sudah
 * ada di runDueJobs dan tidak perlu ditulis ulang, (3) percobaan kirimnya jadi
 * terlihat di Admin -> Monitoring Job saat partner mengeluh "callback tidak masuk".
 *
 * TIDAK PERNAH melempar: order yang sudah selesai tidak boleh dianggap gagal
 * hanya karena barisan job gagal ditulis.
 */
export async function enqueuePartnerCallback(orderId: string): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { partnerId: true, partner: { select: { callbackUrl: true, isActive: true } } },
    });
    if (!order?.partnerId) return; // order storefront biasa — tidak ada yang perlu diberi tahu
    if (!order.partner?.isActive || !order.partner.callbackUrl) return; // partner memilih polling

    await db.job.create({
      data: { type: "partner-callback", payload: { orderId }, runAt: new Date() },
    });
  } catch (e) {
    console.error("enqueuePartnerCallback: gagal menjadwalkan callback partner", { orderId, error: e });
  }
}

export interface PartnerCallbackPayload {
  ref_id: string;
  order_number: string;
  sku: string | null;
  customer_no: string;
  status: string;
  rc: string;
  message: string;
  sn: string | null;
  price: number;
  updated_at: string;
}

export function buildCallbackPayload(order: {
  partnerRefId: string | null;
  orderNumber: string;
  productItemId: string | null;
  target: unknown;
  status: string;
  sellingPrice: bigint;
  manualSn: string | null;
  updatedAt: Date;
  inputFields: { name: string }[];
  latestMessage: string | null;
  latestSn: string | null;
}): PartnerCallbackPayload {
  const status = toPartnerStatus(order.status);
  return {
    ref_id: order.partnerRefId ?? "",
    order_number: order.orderNumber,
    sku: order.productItemId,
    // Dikirim balik dalam bentuk yang SAMA dengan yang partner kirim (pipe),
    // bukan bentuk sambung yang dipakai ke provider — kalau tidak, partner tidak
    // bisa mencocokkan callback dengan transaksinya sendiri.
    customer_no: describeTargetForPartner(order.inputFields, order.target),
    status,
    rc: rcForStatus(status),
    message: order.latestMessage ?? (status === "Sukses" ? "Transaksi berhasil" : "Transaksi selesai"),
    sn: order.latestSn ?? order.manualSn,
    price: Number(order.sellingPrice),
    updated_at: order.updatedAt.toISOString(),
  };
}

function describeTargetForPartner(inputFields: { name: string }[], target: unknown): string {
  if (target === null || typeof target !== "object") return "";
  const t = target as Record<string, string>;
  if (inputFields.length > 0) return inputFields.map((f) => t[f.name] ?? "").join("|");
  return Object.values(t).join("|");
}

/**
 * Mengirim satu callback. MELEMPAR kalau gagal — dengan sengaja: runDueJobs yang
 * memutuskan retry & backoff-nya, jadi logika itu tidak diduplikasi di sini.
 */
export async function sendPartnerCallback(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      partner: true,
      fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 },
    },
  });
  if (!order || !order.partner) return; // order/partner sudah hilang — tidak ada yang bisa dikerjakan
  const callbackUrl = order.partner.callbackUrl;
  if (!callbackUrl || !order.partner.isActive) return;

  const item = order.productItemId
    ? await db.productItem.findUnique({
        where: { id: order.productItemId },
        select: { product: { select: { inputFields: true } } },
      })
    : null;
  const inputFields = (item?.product.inputFields as { name: string }[] | undefined) ?? [];
  const latest = order.fulfillments[0];

  const payload = buildCallbackPayload({
    partnerRefId: order.partnerRefId,
    orderNumber: order.orderNumber,
    productItemId: order.productItemId,
    target: order.target,
    status: order.status,
    sellingPrice: order.sellingPrice,
    manualSn: order.manualSn,
    updatedAt: order.updatedAt,
    inputFields,
    latestMessage: latest?.message ?? null,
    latestSn: latest?.status === "SUCCESS" ? (latest.sn ?? null) : null,
  });

  // Body ditandatangani sebagai STRING MENTAH, dan string itu juga yang dikirim.
  // Kalau ditandatangani dari objek lalu di-serialize lagi oleh fetch, urutan key
  // bisa berbeda dan tanda tangan tidak akan pernah cocok di sisi partner.
  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "DannShop-Callback/1",
    "X-DannShop-Event": "transaction.update",
  };
  if (order.partner.callbackSecretEnc) {
    try {
      headers["X-DannShop-Signature"] = signCallbackBody(rawBody, decryptJson<string>(order.partner.callbackSecretEnc));
    } catch (e) {
      console.error("sendPartnerCallback: gagal dekripsi callbackSecret, kirim tanpa tanda tangan", {
        orderId,
        error: e,
      });
    }
  }

  const res = await fetch(callbackUrl, {
    method: "POST",
    headers,
    body: rawBody,
    signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
  });

  // Di sini `res.ok` MEMANG ukuran yang benar (beda dari Midtrans/Digiflazz yang
  // membalas 200 untuk penolakan): kita yang menentukan kontraknya, dan kontrak
  // itu menyebut 2xx = diterima. Non-2xx dilempar supaya job di-retry.
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Callback partner ditolak HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}
