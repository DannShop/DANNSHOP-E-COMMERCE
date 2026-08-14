import { Prisma, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getActiveProviders, getAdapter } from "@/lib/providers/registry";
import type { ProviderTrxResult } from "@/lib/providers/types";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { generateRefId } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { decideRefundDestination } from "@/lib/wallet/decisions";
import {
  formatOrderAlertMessage,
  formatFulfillmentFailureMessage,
  formatManualOrderMessage,
  formatOrderSuccessMessage,
  notifyTelegram,
} from "@/lib/notify/telegram";
import { describeOrderTarget } from "@/lib/order/customer-no";
import { diagnoseFailure } from "@/lib/order/failure-reason";
import { sendOrderCompletedEmail, sendOrderFailedEmail } from "@/lib/notify/email";
import { decideFulfillmentRetry } from "@/lib/order/retry-decision";
import { decideFailover } from "@/lib/order/failover-decision";
import { truncateNote } from "@/lib/order/status-note";
import { enqueuePartnerCallback } from "@/lib/partner/callback";

// Status order yang TIDAK BOLEH ditimpa oleh proses otomatis (webhook, job
// recheck-fulfillment, job runner). Begitu order mencapai salah satu status ini,
// hanya aksi admin eksplisit (mis. markRefundedAction, yang pakai updateMany
// terkunci status) boleh mengubahnya lagi. Ini mencegah double-payout: order yang
// sudah ditandai selesai manual oleh admin (COMPLETED) lalu di-overwrite jadi
// REFUNDED/REFUND_PENDING oleh hasil fulfillment yang datang belakangan dari job
// recheck yang lupa dibatalkan.
export const ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION = [
  "COMPLETED",
  "REFUNDED",
  "EXPIRED",
  "FAILED",
  "REFUND_PENDING",
] as const;

export async function dispatchFulfillment(orderId: string): Promise<void> {
  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "PAID" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return; // sudah PROCESSING/status lain - sedang/sudah diproses pemanggil lain

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const item = await db.productItem.findUniqueOrThrow({
    where: { id: order.productItemId! },
    include: { providerSkus: true, product: true },
  });

  await db.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: "PAID", toStatus: "PROCESSING" },
  });

  // Produk manual (App Premium dsb): uangnya sudah masuk, tapi tidak ada
  // provider yang bisa mengirimkannya. Berhenti di PROCESSING dan panggil admin.
  //
  // Kalau ini diteruskan ke selectAndSend seperti order biasa, hasilnya pasti
  // NEEDS_REVIEW "Tidak ada provider SKU tersedia" - order yang sebenarnya
  // sehat akan menumpuk di antrean masalah dan tidak bisa dibedakan dari order
  // yang benar-benar rusak.
  if (order.fulfillmentMode === "MANUAL") {
    await db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        toStatus: "PROCESSING",
        note: truncateNote("Produk manual - menunggu dikirim admin"),
      },
    });
    await notifyTelegram(
      "order_manual",
      formatManualOrderMessage({
        orderNumber: order.orderNumber,
        productName: order.productName,
        itemName: order.itemName,
        total: order.total,
        target: describeOrderTarget(order.target),
        buyerLabel: order.buyerEmail,
      }),
    );
    return;
  }

  await selectAndSend(order, item, 1);
}

type OrderForFulfillment = { id: string; orderNumber: string; sellingPrice: bigint; target: unknown };
type ItemForFulfillment = {
  providerSkus: { provider: import("@prisma/client").ProviderKey; providerSkuCode: string; costPrice: bigint; status: import("@prisma/client").ProviderSkuStatus }[];
  product: { inputFields: unknown };
};

// Helper bersama untuk "eskalasi order + histori + alert Telegram" dipakai di 4 titik
// (selectAndSend gagal pilih SKU, applyFulfillmentResult auto-refund crash, applyFulfillmentResult
// jalur guest REFUND_PENDING, runner.ts eskalasi 30x-recheck). Menjamin invariant inti Fase 7a:
// alert Telegram SELALU terkirim kalau klaim status order berhasil, walau orderStatusHistory.create
// gagal (mis. overflow VARCHAR(191) yang sudah pernah kejadian, deadlock, dsb) - jangan sampai
// gagal tulis histori diam-diam menggagalkan notifikasi yang menyusul setelahnya.
export async function escalateOrder(params: {
  orderId: string;
  orderNumber: string;
  fromStatus?: OrderStatus;
  toStatus: "NEEDS_REVIEW" | "REFUND_PENDING";
  note: string;
  // default true - dipakai selectAndSend jalur retry manual admin (Fix 3, plan Fase 7a) supaya
  // tidak kirim alert Telegram dobel untuk aksi yang admin sendiri picu.
  alertOnFailure?: boolean;
}): Promise<{ claimed: boolean }> {
  const claimed = await db.order.updateMany({
    where: { id: params.orderId, status: { notIn: [...ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION] } },
    data: { status: params.toStatus },
  });
  if (claimed.count === 0) {
    console.error("escalateOrder: order sudah di status final/tidak bisa ditimpa otomasi, skip", {
      orderId: params.orderId, toStatus: params.toStatus,
    });
    return { claimed: false };
  }

  try {
    await db.orderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        note: truncateNote(params.note),
      },
    });
  } catch (e) {
    console.error("escalateOrder: orderStatusHistory.create gagal, tetap lanjut kirim alert", {
      orderId: params.orderId, error: e,
    });
  }

  if (params.alertOnFailure ?? true) {
    // REFUND_PENDING dipetakan ke event "order_failed" (bukan event tersendiri):
    // dari sudut pandang admin itu satu kejadian yang sama - order gagal dan
    // uangnya harus dibalikin - cuma beda cara pengembaliannya.
    await notifyTelegram(
      params.toStatus === "NEEDS_REVIEW" ? "order_needs_review" : "order_failed",
      formatOrderAlertMessage({ orderNumber: params.orderNumber, status: params.toStatus, reason: params.note }),
    );
  }
  return { claimed: true };
}

// Logika inti "pilih SKU provider lalu kirim transaksi" - dipakai baik untuk
// pengiriman pertama (dispatchFulfillment) maupun retry manual oleh admin
// (retryOrderFulfillment), supaya perilakunya konsisten di kedua jalur.
// alertOnFailure=false dipakai retryOrderFulfillment (retry dipicu admin sendiri) supaya
// kegagalan "tidak ada SKU provider"/"harga modal naik" di jalur retry tidak kirim alert
// Telegram dobel - admin yang mengklik retry sudah tahu order ini bermasalah.
async function selectAndSend(
  order: OrderForFulfillment,
  item: ItemForFulfillment,
  attemptNo: number,
  alertOnFailure: boolean = true,
  excludeProviders?: Set<import("@prisma/client").ProviderKey>,
): Promise<void> {
  const activeProviders = await getActiveProviders();
  const decision = selectFulfillmentSku(
    { sellingPrice: order.sellingPrice },
    item.providerSkus,
    activeProviders,
    excludeProviders,
  );
  if (!decision.ok) {
    const note =
      decision.reason === "no_provider"
        ? "Tidak ada provider SKU tersedia"
        : decision.reason === "provider_inactive"
          ? "Provider sedang dinonaktifkan admin"
          : "Harga modal naik di atas harga jual";
    await escalateOrder({
      orderId: order.id,
      orderNumber: order.orderNumber,
      fromStatus: "PROCESSING",
      toStatus: "NEEDS_REVIEW",
      note,
      alertOnFailure,
    });
    return;
  }

  const ourRefId = generateRefId("FUL", new Date());
  const fulfillment = await db.orderFulfillment.create({
    data: {
      orderId: order.id,
      attemptNo,
      provider: decision.sku.provider,
      providerSkuCode: decision.sku.providerSkuCode,
      costPrice: decision.sku.costPrice,
      ourRefId,
      status: "SENT",
    },
  });

  const target = buildCustomerNo(item.product.inputFields as { name: string }[], order.target as Record<string, string>);

  // Jadwalkan jaring pengaman recheck SEBELUM panggil adapter - supaya kalau
  // adapter.createTransaction throw (timeout/error jaringan), tetap ada job
  // yang akan checkStatus ulang nanti alih-alih order macet permanen.
  await db.job.create({
    data: {
      type: "recheck-fulfillment",
      payload: { fulfillmentId: fulfillment.id, attempt: 1 },
      runAt: new Date(Date.now() + 60_000),
    },
  });

  try {
    const adapter = await getAdapter(decision.sku.provider);
    const result = await adapter.createTransaction({
      skuCode: decision.sku.providerSkuCode,
      target,
      refId: ourRefId,
      context: { orderId: order.id, orderNumber: order.orderNumber, fulfillmentId: fulfillment.id },
    });
    await applyFulfillmentResult(fulfillment.id, result);
  } catch (e) {
    console.error("selectAndSend: adapter.createTransaction gagal, mengandalkan job recheck-fulfillment", {
      orderId: order.id, fulfillmentId: fulfillment.id, error: e,
    });
    // JANGAN throw - job recheck-fulfillment yang sudah dijadwalkan akan coba checkStatus nanti.
    // Fulfillment row tetap berstatus SENT, itu status valid untuk recheck job mengambil alih.
  }
}

/**
 * Coba alihkan order ke provider lain setelah satu provider gagal.
 *
 * Mengembalikan true HANYA kalau percobaan baru benar-benar dikirim - pemanggil
 * memakai itu untuk berhenti sebelum menjalankan refund. Mengembalikan false pada
 * semua kasus lain (kategori tidak aman, percobaan habis, tidak ada provider
 * pengganti yang layak), supaya perilaku lama tetap jalan apa adanya.
 *
 * SENGAJA tidak melempar: kegagalan di dalam sini tidak boleh menghalangi refund
 * yang seharusnya terjadi. Failover itu peningkatan, bukan syarat.
 */
async function tryFailover(
  order: { id: string; orderNumber: string; sellingPrice: bigint; target: unknown; productItemId: string | null },
  orderId: string,
  providerMessage: string | null,
): Promise<boolean> {
  try {
    if (!order.productItemId) return false;

    const attempts = await db.orderFulfillment.findMany({
      where: { orderId },
      select: { provider: true },
    });
    const decision = decideFailover({
      category: diagnoseFailure(providerMessage).category,
      attemptsSoFar: attempts.length,
    });
    if (!decision.failover) return false;

    // Provider yang SUDAH pernah dicoba untuk order ini tidak boleh dicoba lagi -
    // kalau tidak, kegagalan yang sama akan berputar sampai batas percobaan habis.
    const tried = new Set(attempts.map((a) => a.provider));

    const item = await db.productItem.findUniqueOrThrow({
      where: { id: order.productItemId },
      include: { providerSkus: true, product: true },
    });

    // Dicek DULU apakah ada kandidat yang benar-benar lolos semua syarat
    // (status ACTIVE, provider tidak di-kill-switch, harga modal masih di bawah
    // harga jual). Tanpa pengecekan ini, selectAndSend akan mengeskalasi order ke
    // NEEDS_REVIEW saat tidak ada kandidat - padahal yang benar adalah membiarkan
    // jalur refund yang sudah ada mengambil alih.
    const activeProviders = await getActiveProviders();
    const candidate = selectFulfillmentSku(
      { sellingPrice: order.sellingPrice },
      item.providerSkus,
      activeProviders,
      tried,
    );
    if (!candidate.ok) return false;

    await db.orderStatusHistory.create({
      data: {
        orderId,
        toStatus: "PROCESSING",
        note: truncateNote(
          `Failover otomatis ke ${candidate.sku.provider} (percobaan ${attempts.length + 1}). ` +
            `Sebab kegagalan sebelumnya: ${diagnoseFailure(providerMessage).label}`,
        ),
      },
    });

    // alertOnFailure=false: kalau percobaan pengganti ini pun gagal, alert-nya
    // dikirim lewat jalur kegagalan biasa di applyFulfillmentResult - bukan dua
    // notifikasi untuk satu order yang sama.
    await selectAndSend(order, item, attempts.length + 1, false, tried);
    return true;
  } catch (e) {
    // Failover gagal dengan cara yang tidak terduga - JANGAN telan order-nya.
    // Kembalikan false supaya jalur refund/eskalasi yang sudah teruji tetap jalan.
    console.error("tryFailover: gagal, melanjutkan ke jalur refund biasa", { orderId, error: e });
    return false;
  }
}

export async function applyFulfillmentResult(fulfillmentId: string, result: ProviderTrxResult): Promise<void> {
  const status = result.status === "success" ? "SUCCESS" : result.status === "failed" ? "FAILED" : "PROCESSING";

  // Klaim atomik: hanya satu pemanggil konkuren (webhook vs. job recheck-fulfillment)
  // yang berhasil flip dari status non-final ke status baru.
  const claimed = await db.orderFulfillment.updateMany({
    where: { id: fulfillmentId, status: { notIn: ["SUCCESS", "FAILED"] } },
    data: { status, sn: result.sn, message: result.message, rawCallback: result.raw as object },
  });
  if (claimed.count === 0) return; // sudah final (SUCCESS/FAILED) oleh pemanggil lain, idempotent

  const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });

  if (status === "SUCCESS") {
    // Klaim atomik terhadap status order: kalau order sudah di status final/tidak-bisa-
    // ditimpa (mis. admin sudah pakai "Tandai Selesai Manual" sementara hasil SUCCESS ini
    // datang belakangan dari job recheck-fulfillment yang lupa dibatalkan), JANGAN timpa -
    // itu akan bikin histori order jadi salah/ambigu walau tidak ada dampak uang di sini.
    const claimedOrder = await db.order.updateMany({
      where: { id: fulfillment.orderId, status: { notIn: [...ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (claimedOrder.count === 0) {
      console.error("applyFulfillmentResult: hasil SUCCESS datang untuk order yang sudah final di status lain (mis. sudah ditandai selesai manual oleh admin), dilewati", {
        orderId: fulfillment.orderId, fulfillmentId,
      });
      return;
    }
    await db.orderStatusHistory.create({
      data: { orderId: fulfillment.orderId, toStatus: "COMPLETED", note: truncateNote(`SN: ${result.sn ?? "-"}`) },
    });
    const completedOrder = await db.order.findUnique({ where: { id: fulfillment.orderId } });
    if (completedOrder) {
      await sendOrderCompletedEmail(completedOrder, result.sn ?? null);
      await notifyTelegram(
        "order_success",
        formatOrderSuccessMessage({
          orderNumber: completedOrder.orderNumber,
          productName: completedOrder.productName,
          itemName: completedOrder.itemName,
          total: completedOrder.total,
          target: describeOrderTarget(completedOrder.target),
          buyerLabel: completedOrder.buyerEmail,
          sn: result.sn ?? null,
        }),
      );
    }
    // Order lewat API partner: beri tahu sistem mereka. No-op untuk order
    // storefront biasa (dijaga di dalam enqueuePartnerCallback).
    await enqueuePartnerCallback(fulfillment.orderId);
  } else if (status === "FAILED") {
    const order = await db.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });

    // ---- Failover antar-provider, SEBELUM keputusan refund apa pun -------------
    //
    // Hanya untuk kegagalan yang bisa dipastikan terjadi sebelum provider menyentuh
    // produk (lihat failover-decision.ts). Kalau tidak ada alternatif yang benar-benar
    // bisa dipakai, sengaja JATUH KE BAWAH ke jalur refund yang sudah ada - bukan
    // eskalasi NEEDS_REVIEW. Kalau tidak, order yang dulunya di-refund otomatis
    // malah berakhir menunggu admin, dan itu kemunduran buat pembeli.
    if (await tryFailover(order, fulfillment.orderId, result.message)) return;

    if (decideRefundDestination(order.userId) === "wallet") {
      // Member — auto-refund ke saldo, atomik dalam satu transaksi (ledger double-entry)
      try {
        await db.$transaction(async (tx) => {
          const wallet = await tx.wallet.update({
            where: { userId: order.userId! },
            data: { balance: { increment: order.total } },
          });
          await tx.walletLedger.create({
            data: {
              walletId: wallet.id,
              type: "REFUND",
              amount: order.total,
              balanceAfter: wallet.balance,
              referenceType: "order",
              referenceId: order.id,
              idempotencyKey: `order-refund:${order.id}`,
            },
          });
          // Klaim atomik DI DALAM transaksi: kalau order sudah di status final/tidak-bisa-ditimpa
          // (mis. admin sudah "Tandai Selesai Manual" saat FAILED ini masih diproses), throw supaya
          // SELURUH transaksi (termasuk kredit wallet & ledger di atas) ikut rollback - mencegah
          // double-payout (member dapat saldo refund PADAHAL admin sudah anggap order selesai/dikirim).
          const claimedTx = await tx.order.updateMany({
            where: { id: order.id, status: { notIn: [...ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION] } },
            data: { status: "REFUNDED" },
          });
          if (claimedTx.count === 0) {
            throw new Error("ORDER_ALREADY_TERMINAL");
          }
        });
        const diagnosis = diagnoseFailure(result.message);
        await db.orderStatusHistory.create({
          data: {
            orderId: order.id,
            toStatus: "REFUNDED",
            note: truncateNote(`Auto-refund ke saldo — ${diagnosis.label}: ${result.message}`),
          },
        });
        await sendOrderFailedEmail(order, result.message, { toWallet: true });
        // Auto-refund yang BERHASIL pun tetap harus memberi tahu admin. Refund
        // menyelamatkan uang pelanggan, tapi tidak memperbaiki sebabnya - dan
        // sebab yang sistemik akan menggagalkan semua order berikutnya juga.
        await notifyTelegram(
          "order_failed",
          formatFulfillmentFailureMessage({
            orderNumber: order.orderNumber,
            productName: order.productName,
            itemName: order.itemName,
            providerMessage: result.message ?? "",
            diagnosisLabel: diagnosis.label,
            diagnosisAction: diagnosis.action,
            refunded: "wallet",
          }),
        );
        // Partner WAJIB diberi tahu kegagalan, bukan cuma keberhasilan: saldonya
        // sudah dikembalikan di sini, dan kalau mereka tidak tahu, customer
        // mereka menunggu barang yang tidak akan pernah datang.
        await enqueuePartnerCallback(order.id);
      } catch (e) {
        if (e instanceof Error && e.message === "ORDER_ALREADY_TERMINAL") {
          // Transaksi sudah di-rollback oleh Prisma (kredit wallet & ledger TIDAK jadi ditulis) -
          // tidak ada apa pun yang perlu dibatalkan. JANGAN jalankan fallback eskalasi NEEDS_REVIEW
          // di bawah - order ini sudah selesai lewat jalur lain (admin), bukan kegagalan yang nyata.
          console.error("applyFulfillmentResult: auto-refund dibatalkan (rollback) - order sudah final di status lain (mis. sudah ditandai selesai manual oleh admin)", {
            orderId: order.id,
          });
          return;
        }
        const note = truncateNote(`Auto-refund gagal: ${e instanceof Error ? e.message : String(e)}`);
        console.error("applyFulfillmentResult: auto-refund ke saldo gagal, eskalasi ke NEEDS_REVIEW", {
          orderId: order.id, error: e,
        });
        await escalateOrder({ orderId: order.id, orderNumber: order.orderNumber, toStatus: "NEEDS_REVIEW", note });
      }
    } else {
      // Guest — antrean manual admin (Fase 7a: halaman /admin/orders + notifikasi Telegram).
      // alertOnFailure=false lalu kirim sendiri: pesan kaya di bawah memuat sebab +
      // tindakan, jauh lebih berguna daripada alert generik escalateOrder, dan
      // mengirim keduanya cuma bikin notifikasi dobel untuk satu kejadian.
      const diagnosis = diagnoseFailure(result.message);
      const escalated = await escalateOrder({
        orderId: order.id,
        orderNumber: order.orderNumber,
        toStatus: "REFUND_PENDING",
        note: truncateNote(`${diagnosis.label}: ${result.message}`),
        alertOnFailure: false,
      });
      if (escalated.claimed) {
        await notifyTelegram(
          "order_failed",
          formatFulfillmentFailureMessage({
            orderNumber: order.orderNumber,
            productName: order.productName,
            itemName: order.itemName,
            providerMessage: result.message ?? "",
            diagnosisLabel: diagnosis.label,
            diagnosisAction: diagnosis.action,
            refunded: "manual",
          }),
        );
      }
      await sendOrderFailedEmail(order, result.message, { toWallet: false });
    }
  }
}

// Retry manual oleh admin untuk order yang macet di NEEDS_REVIEW akibat gagal fulfillment.
// Memakai decideFulfillmentRetry untuk menentukan apakah cukup cek ulang status attempt
// terakhir (recheck_status) atau perlu kirim attempt baru (send_fresh).
export async function retryOrderFulfillment(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Klaim atomik: hanya satu pemanggil yang berhasil pindah dari NEEDS_REVIEW ke PROCESSING,
  // mencegah retry ganda dijalankan bersamaan untuk order yang sama.
  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "NEEDS_REVIEW" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return { ok: false, error: "Order tidak dalam status yang bisa di-retry." };

  // Order sudah ter-claim (PROCESSING) di atas - bungkus semua langkah setelahnya dalam
  // try/catch supaya kalau ADA throw tak terduga (mis. findUniqueOrThrow gagal, DB write
  // lain gagal), order tidak macet permanen di PROCESSING (hilang dari antrean NEEDS_REVIEW
  // admin, dan tidak bisa di-retry ulang karena guard klaim di atas butuh status NEEDS_REVIEW).
  try {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    await db.orderStatusHistory.create({
      data: { orderId, fromStatus: "NEEDS_REVIEW", toStatus: "PROCESSING", note: "Retry manual oleh admin" },
    });

    const fulfillments = await db.orderFulfillment.findMany({
      where: { orderId },
      orderBy: { attemptNo: "desc" },
      select: { id: true, attemptNo: true, status: true },
    });
    const decision = decideFulfillmentRetry(fulfillments);

    if (decision.action === "not_eligible") {
      await db.order.update({ where: { id: orderId }, data: { status: "NEEDS_REVIEW" } });
      await db.orderStatusHistory.create({
        data: { orderId, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note: decision.reason },
      });
      return { ok: false, error: decision.reason };
    }

    const item = await db.productItem.findUniqueOrThrow({
      where: { id: order.productItemId! },
      include: { providerSkus: true, product: true },
    });

    if (decision.action === "recheck_status") {
      const fulfillment = await db.orderFulfillment.findUniqueOrThrow({ where: { id: decision.fulfillmentId } });
      const target = buildCustomerNo(item.product.inputFields as { name: string }[], order.target as Record<string, string>);
      try {
        // allowInactive: true - retry manual admin untuk cek ulang status attempt yang sudah
        // terlanjur dikirim ke provider tidak boleh terhalang kill-switch (bukan transaksi baru).
        const adapter = await getAdapter(fulfillment.provider, db, { allowInactive: true });
        const result = await adapter.checkStatus({
          skuCode: fulfillment.providerSkuCode,
          target,
          refId: fulfillment.ourRefId,
          context: { orderId: order.id, orderNumber: order.orderNumber, fulfillmentId: fulfillment.id },
        });
        await applyFulfillmentResult(fulfillment.id, result);
        if (result.status === "pending") {
          await db.job.create({
            data: { type: "recheck-fulfillment", payload: { fulfillmentId: fulfillment.id, attempt: 1 }, runAt: new Date(Date.now() + 60_000) },
          });
        }
      } catch (e) {
        console.error("retryOrderFulfillment: checkStatus gagal, menjadwalkan recheck job", { orderId, error: e });
        // JANGAN biarkan order diam tanpa jaring pengaman - jadwalkan recheck job
        // seperti dispatchFulfillment/selectAndSend melakukannya untuk attempt baru.
        await db.job.create({
          data: { type: "recheck-fulfillment", payload: { fulfillmentId: fulfillment.id, attempt: 1 }, runAt: new Date(Date.now() + 60_000) },
        });
      }
      return { ok: true };
    }

    // decision.action === "send_fresh"
    // alertOnFailure=false: ini retry yang dipicu admin sendiri, jangan kirim alert Telegram
    // dobel kalau attempt baru ini gagal lagi dengan alasan "no_provider"/harga modal naik
    // (Fase 7a plan: alert Telegram hanya untuk transisi status OTOMATIS, bukan aksi admin).
    await selectAndSend(order, item, decision.nextAttemptNo, false);
    return { ok: true };
  } catch (e) {
    // Order sudah "kita miliki" (PROCESSING) di sini, jadi klaim guarded tetap dipakai untuk
    // konsistensi dengan pola di seluruh file - kembalikan ke NEEDS_REVIEW supaya admin bisa
    // coba retry lagi, jangan biarkan macet.
    console.error("retryOrderFulfillment: gagal tak terduga setelah klaim, mengembalikan ke NEEDS_REVIEW", { orderId, error: e });
    const message = e instanceof Error ? e.message : "Gagal melakukan retry.";
    const claimedBack = await db.order.updateMany({
      where: { id: orderId, status: { notIn: [...ORDER_STATUSES_NOT_OVERWRITABLE_BY_AUTOMATION] } },
      data: { status: "NEEDS_REVIEW" },
    });
    if (claimedBack.count === 0) {
      console.error("retryOrderFulfillment: order sudah di status final lain saat pemulihan, skip histori", { orderId });
      return { ok: false, error: message };
    }
    await db.orderStatusHistory.create({
      data: { orderId, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note: truncateNote(`Retry gagal: ${message}`) },
    });
    return { ok: false, error: message };
  }
}

// Retry manual oleh admin untuk order MEMBER yang gagal di-refund otomatis ke saldo wallet
// (userId wajib ada - guest TIDAK lewat fungsi ini, guest dipegang via REFUND_PENDING +
// antrean manual admin, bukan kredit saldo).
export async function retryOrderRefund(orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "NEEDS_REVIEW" || !order.userId) {
    return { ok: false, error: "Order ini bukan kasus refund-ke-saldo yang gagal." };
  }

  // Refund hanya boleh jalan kalau tidak ada percobaan fulfillment sama sekali, ATAU
  // percobaan terakhir sudah FAILED (final). Kalau attempt terakhir masih SENT/PROCESSING/
  // SUCCESS, barang bisa menyusul terkirim dari provider - jangan refund dulu, arahkan
  // admin ke tombol "Coba Lagi" (retryOrderFulfillment), bukan refund.
  const fulfillments = await db.orderFulfillment.findMany({
    where: { orderId },
    orderBy: { attemptNo: "desc" },
    select: { id: true, attemptNo: true, status: true },
  });
  const lastAttempt = fulfillments[0];
  if (lastAttempt && lastAttempt.status !== "FAILED") {
    return {
      ok: false,
      error: "Order ini masih ada percobaan fulfillment yang belum final — gunakan tombol Coba Lagi, bukan refund.",
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId: order.userId! },
        data: { balance: { increment: order.total } },
      });
      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "REFUND",
          amount: order.total,
          balanceAfter: wallet.balance,
          referenceType: "order",
          referenceId: order.id,
          // Idempotency key SAMA PERSIS dengan jalur auto-refund di applyFulfillmentResult -
          // unique constraint di kolom ini mencegah double-credit kalau retry dipanggil dua kali.
          idempotencyKey: `order-refund:${order.id}`,
        },
      });
      // Klaim atomik DI DALAM transaksi yang sama: kalau status order sudah berubah
      // sejak dicek di atas (mis. race dengan retryOrderFulfillment yang sempat claim
      // PROCESSING dan mengirim ke provider), count === 0 -> throw supaya SELURUH
      // transaksi (termasuk kredit wallet & ledger di atas) ikut rollback. Tanpa ini,
      // customer bisa dapat refund DAN barang tetap terkirim (dobel rugi).
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: "NEEDS_REVIEW" },
        data: { status: "REFUNDED" },
      });
      if (claimed.count === 0) {
        throw new Error("ORDER_STATUS_CHANGED");
      }
    });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, toStatus: "REFUNDED", note: "Refund ke saldo diulang manual oleh admin" },
    });
    await enqueuePartnerCallback(order.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Refund untuk order ini sudah pernah berhasil sebelumnya." };
    }
    if (e instanceof Error && e.message === "ORDER_STATUS_CHANGED") {
      return { ok: false, error: "Order sudah berubah status, refund dibatalkan." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Gagal mengulang refund." };
  }
}
