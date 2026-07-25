"use server";

import { Prisma } from "@prisma/client";
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

async function createOrderWithRetry(data: Parameters<typeof db.order.create>[0]["data"]) {
  try {
    return await db.order.create({ data });
  } catch (e) {
    const isOrderNumberCollision =
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      Array.isArray(e.meta?.target) &&
      (e.meta!.target as string[]).includes("orderNumber");
    if (!isOrderNumberCollision) throw e;
    // retry sekali dengan orderNumber baru
    return db.order.create({ data: { ...data, orderNumber: generateOrderNumber(new Date()) } });
  }
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

  const order = await createOrderWithRetry({
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
    console.error("Checkout: Midtrans charge gagal", { orderId: order.id, error: e });
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
    await db.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Charge Midtrans gagal" },
    });
    return { error: "Gagal membuat pembayaran, silakan coba lagi." };
  }

  try {
    await db.job.create({
      data: { type: "expire-order", payload: { orderId: order.id }, runAt: expiredAt },
    });
  } catch (e) {
    console.error("Checkout: gagal schedule job expire-order", { orderId: order.id, error: e });
    // tidak throw — order & pembayaran tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  return { ok: "Order dibuat.", orderNumber: order.orderNumber };
}
