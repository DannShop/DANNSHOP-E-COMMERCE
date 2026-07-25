import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import type { ProviderTrxResult } from "@/lib/providers/types";
import { buildCustomerNo } from "@/lib/order/customer-no";
import { generateRefId } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";

export async function dispatchFulfillment(orderId: string): Promise<void> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PAID") return; // sudah diproses / bukan giliran fulfillment

  const item = await db.productItem.findUniqueOrThrow({
    where: { id: order.productItemId! },
    include: { providerSkus: true, product: true },
  });

  await db.order.update({ where: { id: order.id }, data: { status: "PROCESSING" } });
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
  const adapter = await getAdapter(decision.sku.provider);
  const result = await adapter.createTransaction({
    skuCode: decision.sku.providerSkuCode,
    target,
    refId: ourRefId,
  });
  await applyFulfillmentResult(fulfillment.id, result);

  if (result.status === "pending") {
    await db.job.create({
      data: {
        type: "recheck-fulfillment",
        payload: { fulfillmentId: fulfillment.id, attempt: 1 },
        runAt: new Date(Date.now() + 60_000),
      },
    });
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
    // Fase 3 cuma 1 provider (Digiflazz) — tidak ada fallback provider lain (itu Fase 6).
    // Guest checkout → refund_pending (antrean manual admin), sesuai spec §7.
    await db.order.update({ where: { id: fulfillment.orderId }, data: { status: "REFUND_PENDING" } });
    await db.orderStatusHistory.create({
      data: { orderId: fulfillment.orderId, toStatus: "REFUND_PENDING", note: result.message },
    });
  }
}
