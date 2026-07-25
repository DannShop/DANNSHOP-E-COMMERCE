import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import type { ProviderTrxResult } from "@/lib/providers/types";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { generateRefId } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { decideRefundDestination } from "@/lib/wallet/decisions";

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

  const decision = selectFulfillmentSku({ sellingPrice: order.sellingPrice }, item.providerSkus);
  if (!decision.ok) {
    await db.order.update({ where: { id: order.id }, data: { status: "NEEDS_REVIEW" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PROCESSING", toStatus: "NEEDS_REVIEW", note: decision.reason },
    });
    return;
  }

  const ourRefId = generateRefId("FUL", new Date());
  const fulfillment = await db.orderFulfillment.create({
    data: {
      orderId: order.id,
      attemptNo: 1,
      provider: decision.sku.provider,
      providerSkuCode: decision.sku.providerSkuCode,
      costPrice: decision.sku.costPrice,
      ourRefId,
      status: "SENT",
    },
  });

  const target = buildCustomerNo(
    item.product.inputFields as { name: string }[],
    order.target as Record<string, string>,
  );

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
    });
    await applyFulfillmentResult(fulfillment.id, result);
  } catch (e) {
    console.error("dispatchFulfillment: adapter.createTransaction gagal, mengandalkan job recheck-fulfillment", {
      orderId: order.id, fulfillmentId: fulfillment.id, error: e,
    });
    // JANGAN throw - job recheck-fulfillment yang sudah dijadwalkan akan coba checkStatus nanti.
    // Fulfillment row tetap berstatus SENT, itu status valid untuk recheck job mengambil alih.
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
    await db.order.update({
      where: { id: fulfillment.orderId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await db.orderStatusHistory.create({
      data: { orderId: fulfillment.orderId, toStatus: "COMPLETED", note: `SN: ${result.sn ?? "-"}` },
    });
  } else if (status === "FAILED") {
    const order = await db.order.findUniqueOrThrow({ where: { id: fulfillment.orderId } });

    if (decideRefundDestination(order.userId) === "wallet") {
      // Member — auto-refund ke saldo, atomik dalam satu transaksi (ledger double-entry)
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
        await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "REFUNDED", note: `Auto-refund ke saldo: ${result.message}` },
      });
    } else {
      // Guest — antrean manual admin (Fase 7), tidak berubah dari Fase 3
      await db.order.update({ where: { id: order.id }, data: { status: "REFUND_PENDING" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, toStatus: "REFUND_PENDING", note: result.message },
      });
    }
  }
}
