"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { checkoutSchema, extractTargetFromFormData } from "@/lib/validation/checkout";
import { generateOrderNumber } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { chargeByMethodCode } from "@/lib/midtrans/client";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";
import { dispatchFulfillment } from "@/lib/order/fulfillment";
import { headers } from "next/headers";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { getActiveProviders } from "@/lib/providers/registry";

const EXPIRY_MINUTES = 15;

export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
  publicToken?: string;
}

class InsufficientBalanceError extends Error {}

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
    paymentMethod: formData.get("paymentMethod") ?? "qris",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    const ip = extractIp(await headers());
    const guestLimit = await checkRateLimit(`checkout:ip:${ip}`, 3, 60_000);
    if (!guestLimit.allowed) return { error: "Terlalu banyak percobaan checkout, coba lagi sebentar lagi." };
  }

  if (parsed.data.paymentMethod === "balance" && !userId) {
    return { error: "Harus login untuk bayar pakai saldo." };
  }

  // item & activeProviders tidak saling bergantung — ambil paralel, bukan
  // berurutan, biar tidak nambah 1 round-trip DB percuma sebelum tahu itemnya valid.
  const [item, activeProviders] = await Promise.all([
    db.productItem.findUnique({
      where: { id: parsed.data.productItemId, isActive: true },
      include: { product: true, providerSkus: true },
    }),
    getActiveProviders(),
  ]);
  if (!item || !item.product.isActive) return { error: "Produk tidak ditemukan atau tidak aktif." };

  const inputFields = item.product.inputFields as { name: string; label: string }[];
  const missingField = inputFields.find((f) => !parsed.data.target[f.name]?.trim());
  if (missingField) {
    return { error: `${missingField.label} wajib diisi.` };
  }

  const decision = selectFulfillmentSku({ sellingPrice: item.sellingPrice }, item.providerSkus, activeProviders);
  if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };

  if (parsed.data.paymentMethod !== "balance") {
    const method = await db.paymentMethodConfig.findUnique({ where: { code: parsed.data.paymentMethod } });
    if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };
  }

  const now = new Date();
  const orderNumber = generateOrderNumber(now);

  if (parsed.data.paymentMethod === "balance") {
    return createBalanceOrder({ userId: userId!, orderNumber, item, target: parsed.data.target, buyerEmail: parsed.data.buyerEmail });
  }

  return createMidtransOrder({
    userId,
    orderNumber,
    item,
    target: parsed.data.target,
    buyerEmail: parsed.data.buyerEmail,
    now,
    paymentMethodCode: parsed.data.paymentMethod,
  });
}

async function createBalanceOrder(input: {
  userId: string;
  orderNumber: string;
  item: { id: string; sellingPrice: bigint; product: { name: string }; name: string };
  target: Record<string, string>;
  buyerEmail: string;
}): Promise<CheckoutResult> {
  const order = await createOrderWithRetry({
    orderNumber: input.orderNumber,
    status: "PENDING_PAYMENT",
    userId: input.userId,
    productItemId: input.item.id,
    productName: input.item.product.name,
    itemName: input.item.name,
    target: input.target,
    buyerEmail: input.buyerEmail,
    paidVia: "BALANCE",
    sellingPrice: input.item.sellingPrice,
    total: input.item.sellingPrice,
    paymentMethod: "balance",
    payment: { create: { method: "balance", status: "PENDING" } },
  });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout bayar saldo" },
  });

  try {
    await db.$transaction(async (tx) => {
      const debited = await tx.wallet.updateMany({
        where: { userId: input.userId, balance: { gte: order.total } },
        data: { balance: { decrement: order.total } },
      });
      if (debited.count === 0) throw new InsufficientBalanceError();

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "ORDER_PAYMENT",
          amount: -order.total,
          balanceAfter: wallet.balance,
          referenceType: "order",
          referenceId: order.id,
          idempotencyKey: `order-payment:${order.id}`,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      await tx.orderPayment.update({ where: { orderId: order.id }, data: { status: "PAID" } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Bayar pakai saldo" },
      });
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "FAILED", note: "Saldo tidak cukup" },
      });
      return { error: "Saldo tidak cukup (mungkin berubah). Coba lagi atau pakai QRIS." };
    }
    throw e;
  }

  await dispatchFulfillment(order.id);
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
}

async function createMidtransOrder(input: {
  userId: string | null;
  orderNumber: string;
  item: { id: string; sellingPrice: bigint; product: { name: string }; name: string };
  target: Record<string, string>;
  buyerEmail: string;
  now: Date;
  paymentMethodCode: string;
}): Promise<CheckoutResult> {
  const expiredAt = new Date(input.now.getTime() + EXPIRY_MINUTES * 60_000);

  const method = await db.paymentMethodConfig.findUnique({ where: { code: input.paymentMethodCode } });
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  const fee = calculateFee(input.item.sellingPrice, method.feeFlat, method.feePercent);
  const uniqueCode = generateUniqueCode();
  const total = calculateTotal(input.item.sellingPrice, fee, uniqueCode);

  const order = await createOrderWithRetry({
    orderNumber: input.orderNumber,
    status: "PENDING_PAYMENT",
    userId: input.userId,
    productItemId: input.item.id,
    productName: input.item.product.name,
    itemName: input.item.name,
    target: input.target,
    buyerEmail: input.buyerEmail,
    paidVia: "MIDTRANS",
    sellingPrice: input.item.sellingPrice,
    fee,
    uniqueCode,
    total,
    paymentMethod: method.code,
    expiredAt,
    payment: { create: { method: method.code, status: "PENDING", expiredAt } },
  });
  // Ditembak duluan, di-await belakangan bareng orderPayment.update — history
  // insert ini tidak perlu selesai dulu sebelum manggil Midtrans, jadi latency-nya
  // numpuk di belakang panggilan Midtrans (yang jauh lebih lambat karena network
  // eksternal) alih-alih nambah 1 round-trip berurutan di depan.
  const historyPromise = db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout" },
  });

  try {
    const { actions } = await chargeByMethodCode(method.code, order.orderNumber, Number(total));
    await Promise.all([
      db.orderPayment.update({ where: { orderId: order.id }, data: { actions } }),
      historyPromise,
    ]);
  } catch (e) {
    console.error("Checkout: charge Midtrans gagal", { orderId: order.id, method: method.code, error: e });
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

  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
}
