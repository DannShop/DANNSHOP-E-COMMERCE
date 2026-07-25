"use server";

import { db } from "@/lib/db";
import { checkoutSchema, extractTargetFromFormData } from "@/lib/validation/checkout";
import { generateOrderNumber } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { chargeQris } from "@/lib/midtrans/client";

const EXPIRY_MINUTES = 15;

export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
}

export async function createCheckoutOrder(formData: FormData): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse({
    productItemId: formData.get("productItemId"),
    buyerEmail: formData.get("buyerEmail"),
    target: extractTargetFromFormData(formData),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const item = await db.productItem.findUnique({
    where: { id: parsed.data.productItemId, isActive: true },
    include: { product: true, providerSkus: true },
  });
  if (!item || !item.product.isActive) return { error: "Produk tidak ditemukan atau tidak aktif." };

  const decision = selectFulfillmentSku({ sellingPrice: item.sellingPrice }, item.providerSkus);
  if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };

  const now = new Date();
  const orderNumber = generateOrderNumber(now);
  const expiredAt = new Date(now.getTime() + EXPIRY_MINUTES * 60_000);

  const order = await db.order.create({
    data: {
      orderNumber,
      status: "PENDING_PAYMENT",
      productItemId: item.id,
      productName: item.product.name,
      itemName: item.name,
      target: parsed.data.target,
      buyerEmail: parsed.data.buyerEmail,
      paidVia: "MIDTRANS",
      sellingPrice: item.sellingPrice,
      total: item.sellingPrice,
      expiredAt,
      payment: { create: { method: "qris", status: "PENDING", expiredAt } },
    },
  });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout guest" },
  });

  try {
    const charge = await chargeQris({ orderId: order.orderNumber, grossAmount: Number(item.sellingPrice) });
    await db.orderPayment.update({
      where: { orderId: order.id },
      data: {
        paymentRef: charge.transactionId,
        actions: { qrString: charge.qrString },
        rawResponse: charge.raw as object,
      },
    });
  } catch (e) {
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Charge Midtrans gagal" },
    });
    return { error: e instanceof Error ? e.message : "Gagal membuat pembayaran, coba lagi." };
  }

  await db.job.create({
    data: { type: "expire-order", payload: { orderId: order.id }, runAt: expiredAt },
  });

  return { ok: "Order dibuat.", orderNumber: order.orderNumber };
}
