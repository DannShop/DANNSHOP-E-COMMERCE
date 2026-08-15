"use server";

import { Prisma, type FulfillmentMode } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { checkoutSchema, extractTargetFromFormData } from "@/lib/validation/checkout";
import { generateOrderNumber } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import type { PaymentActions } from "@/lib/midtrans/client";
import { createPaymentActions } from "@/lib/payment/create-payment";
import { calculateFee, calculateTotal, generateUniqueCode } from "@/lib/payment/fee";
import { getPaymentRules } from "@/lib/payment/rules";
import { reportChargeFailure } from "@/lib/payment/charge-failure";
import { dispatchFulfillment } from "@/lib/order/fulfillment";
import { headers } from "next/headers";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { getActiveProviders } from "@/lib/providers/registry";
import { sendOrderCreatedEmail } from "@/lib/notify/email";
import { formatOrderCreatedMessage, formatOrderPaidMessage, notifyTelegram } from "@/lib/notify/telegram";
import { describeOrderTarget } from "@/lib/order/customer-no";
import { effectivePrice, isFlashActive } from "@/lib/pricing/effective-price";
import { evaluateVoucher } from "@/lib/voucher/evaluate";
import { buildVoucherRedemption, netPrice, type AppliedVoucher } from "@/lib/voucher/apply";
import { getMembershipContext, type MembershipContext } from "@/lib/membership/tier";
import { hasBenefit } from "@/lib/membership/benefits";
import { requireActiveAccount } from "@/lib/account/user-status";
import { generatePublicToken } from "@/lib/order/public-token";

export interface CheckoutResult {
  ok?: string;
  error?: string;
  orderNumber?: string;
  publicToken?: string;
}

class InsufficientBalanceError extends Error {}

// publicToken diisi DI SINI, bukan di pemanggil: kedua jalur checkout (bayar
// saldo & lewat gateway) melewati fungsi ini, jadi satu tempat ini menjamin tidak
// ada order yang lahir tanpa token acak kriptografis. Pemanggil sengaja tidak
// boleh mengirimnya (Omit) supaya tidak ada dua sumber kebenaran.
// Tipenya disebut eksplisit sebagai varian Unchecked (bukan
// Parameters<typeof db.order.create>): tipe `data` milik Prisma adalah UNION
// Checked|Unchecked, dan `Omit` pada union itu meruntuhkan tipe field seperti
// `userId` jadi tidak terpakai. Kedua pemanggil di bawah memang mengisi FK
// langsung (userId/productItemId), jadi varian inilah yang sebenarnya dipakai.
async function createOrderWithRetry(data: Omit<Prisma.OrderUncheckedCreateInput, "publicToken">) {
  const withToken = { ...data, publicToken: generatePublicToken() };
  try {
    return await db.order.create({ data: withToken });
  } catch (e) {
    const isOrderNumberCollision =
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      Array.isArray(e.meta?.target) &&
      (e.meta!.target as string[]).includes("orderNumber");
    if (!isOrderNumberCollision) throw e;
    // retry sekali dengan orderNumber baru. publicToken ikut dibuat ulang: yang
    // pertama tidak pernah tersimpan, dan token sekali pakai lebih murah daripada
    // memikirkan apakah ada jalur yang sempat membocorkannya.
    return db.order.create({
      data: { ...withToken, orderNumber: generateOrderNumber(new Date()), publicToken: generatePublicToken() },
    });
  }
}

export async function createCheckoutOrder(formData: FormData): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse({
    productItemId: formData.get("productItemId"),
    buyerEmail: formData.get("buyerEmail"),
    buyerPhone: formData.get("buyerPhone") ?? "",
    target: extractTargetFromFormData(formData),
    paymentMethod: formData.get("paymentMethod") ?? "qris",
    voucherCode: formData.get("voucherCode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Sebelum menyentuh apa pun yang berbiaya (rate limit, harga, provider).
  // Tamu (userId null) selalu lolos - tidak ada akun untuk ditangguhkan.
  const blocked = await requireActiveAccount(userId, session?.user?.updatedAt);
  if (blocked) return { error: blocked };

  if (!userId) {
    const ip = extractIp(await headers());
    const guestLimit = await checkRateLimit(`checkout:ip:${ip}`, 3, 60_000);
    if (!guestLimit.allowed) return { error: "Terlalu banyak percobaan checkout, coba lagi sebentar lagi." };
  }

  if (parsed.data.paymentMethod === "balance" && !userId) {
    return { error: "Harus login untuk bayar pakai saldo." };
  }

  // item, activeProviders, & membership tidak saling bergantung — ambil
  // paralel, bukan berurutan, biar tidak nambah round-trip DB percuma sebelum
  // tahu itemnya valid. membership dipakai dua kali di bawah: resolve harga
  // (discountBp) DAN benefit fee/kode unik kalau lanjut ke Midtrans.
  const [item, activeProviders, membership] = await Promise.all([
    db.productItem.findUnique({
      where: { id: parsed.data.productItemId, isActive: true },
      include: { product: true, providerSkus: true },
    }),
    getActiveProviders(),
    getMembershipContext(userId),
  ]);
  if (!item || !item.product.isActive) return { error: "Produk tidak ditemukan atau tidak aktif." };

  const inputFields = item.product.inputFields as { name: string; label: string }[];
  const missingField = inputFields.find((f) => !parsed.data.target[f.name]?.trim());
  if (missingField) {
    return { error: `${missingField.label} wajib diisi.` };
  }

  const now = new Date();
  // Satu-satunya titik baca sellingPrice/memberPrice/flashPrice mentah di
  // seluruh alur checkout - sisanya di bawah cuma memakai `price` yang sudah
  // final. Dihitung sebelum decision/order dibuat supaya cek ketersediaan &
  // tagihan konsisten memakai angka yang sama. discountBp datang dari tier
  // member AKTIF (lib/membership/tier.ts) - login saja TIDAK LAGI memberi
  // diskon otomatis sejak Fase B, harus punya tier yang dibeli.
  const price = effectivePrice(item, { discountBp: membership.discountBp, now });

  // ===== Kode promo =====
  //
  // Dinilai SETELAH harga item final (flash sale & diskon tier sudah masuk),
  // karena voucher memotong dari harga yang benar-benar akan ditagihkan - bukan
  // dari harga papan. Voucher yang menumpuk di atas flash sale adalah pilihan
  // per voucher (Voucher.allowFlashSale), bawaannya tidak boleh.
  //
  // Dinilai SEBELUM order dibuat supaya kode yang tidak berlaku ditolak tanpa
  // meninggalkan order gagal di riwayat pembeli.
  let voucher: AppliedVoucher | null = null;
  if (parsed.data.voucherCode) {
    const hasil = await evaluateVoucher({
      rawCode: parsed.data.voucherCode,
      price,
      categoryId: item.product.categoryId,
      productId: item.productId,
      isFlashActive: isFlashActive(item, now),
      target: parsed.data.target,
      userId,
      now,
    });
    if (!hasil.ok) return { error: hasil.message };
    voucher = { id: hasil.voucherId, code: hasil.code, discount: hasil.discount, targetKey: hasil.targetKey };
  }

  // Cek ketersediaan SKU provider HANYA berlaku untuk produk otomatis. Produk
  // manual memang sengaja tidak punya ProviderSku sama sekali - menjalankan
  // gerbang ini padanya akan menolak setiap checkout dengan alasan "sedang
  // tidak tersedia", padahal barangnya justru selalu tersedia (dikirim admin).
  const isManual = item.product.fulfillmentMode === "MANUAL";
  if (!isManual) {
    const decision = selectFulfillmentSku({ sellingPrice: price }, item.providerSkus, activeProviders);
    if (!decision.ok) return { error: "Item ini sedang tidak tersedia untuk dibeli, coba lagi nanti." };
  }

  if (parsed.data.paymentMethod !== "balance") {
    const method = await db.paymentMethodConfig.findUnique({ where: { code: parsed.data.paymentMethod } });
    if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };
  }

  const orderNumber = generateOrderNumber(now);

  // Disnapshot ke order, bukan dibaca ulang dari produk saat fulfillment -
  // lihat komentar Order.fulfillmentMode di schema.prisma.
  const fulfillmentMode = item.product.fulfillmentMode;

  if (parsed.data.paymentMethod === "balance") {
    return createBalanceOrder({
      userId: userId!,
      orderNumber,
      item,
      price,
      voucher,
      target: parsed.data.target,
      buyerEmail: parsed.data.buyerEmail,
      buyerPhone: parsed.data.buyerPhone,
      fulfillmentMode,
    });
  }

  return createMidtransOrder({
    userId,
    orderNumber,
    item,
    price,
    voucher,
    target: parsed.data.target,
    buyerEmail: parsed.data.buyerEmail,
    buyerPhone: parsed.data.buyerPhone,
    now,
    paymentMethodCode: parsed.data.paymentMethod,
    membership,
    fulfillmentMode,
  });
}

async function createBalanceOrder(input: {
  userId: string;
  orderNumber: string;
  item: { id: string; product: { name: string }; name: string };
  price: bigint;
  voucher: AppliedVoucher | null;
  target: Record<string, string>;
  buyerEmail: string;
  buyerPhone?: string;
  fulfillmentMode: FulfillmentMode;
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
    buyerPhone: input.buyerPhone,
    paidVia: "BALANCE",
    // sellingPrice tetap harga item apa adanya; potongan disimpan terpisah
    // supaya laporan penjualan tidak membacanya sebagai item yang harganya
    // lebih murah. Yang didebit dari saldo adalah `total` di bawah.
    sellingPrice: input.price,
    total: netPrice(input.price, input.voucher),
    paymentMethod: "balance",
    fulfillmentMode: input.fulfillmentMode,
    ...buildVoucherRedemption(input.voucher, input.userId),
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

  // Bayar saldo tidak lewat settlement.ts (tidak ada webhook Midtrans yang
  // datang), jadi notifikasi "pembayaran diterima" harus dikirim dari sini -
  // kalau tidak, seluruh order berbayar-saldo tidak akan pernah terlihat admin.
  await notifyTelegram(
    "order_paid",
    formatOrderPaidMessage({
      orderNumber: order.orderNumber,
      productName: order.productName,
      itemName: order.itemName,
      total: order.total,
      target: describeOrderTarget(order.target),
      buyerLabel: order.buyerEmail,
      paymentMethod: "Saldo",
    }),
  );
  await dispatchFulfillment(order.id);
  await sendOrderCreatedEmail(order, null);
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
}

async function createMidtransOrder(input: {
  userId: string | null;
  orderNumber: string;
  item: { id: string; product: { name: string }; name: string };
  price: bigint;
  voucher: AppliedVoucher | null;
  target: Record<string, string>;
  buyerEmail: string;
  buyerPhone?: string;
  now: Date;
  paymentMethodCode: string;
  membership: MembershipContext;
  fulfillmentMode: FulfillmentMode;
}): Promise<CheckoutResult> {
  const [method, rules] = await Promise.all([
    db.paymentMethodConfig.findUnique({ where: { code: input.paymentMethodCode } }),
    getPaymentRules(),
  ]);
  if (!method || !method.isActive) return { error: "Metode pembayaran tidak tersedia." };

  // Expiry sekarang per metode (diatur admin), bukan lagi konstanta 15 menit.
  // Satu angka ini dipakai untuk expiredAt lokal, custom_expiry ke Midtrans,
  // dan runAt job expire-order - ketiganya WAJIB memakai nilai yang sama.
  const expiryMinutes = method.expiryMinutes;
  const expiredAt = new Date(input.now.getTime() + expiryMinutes * 60_000);

  // Fee/kode unik bisa dimatikan admin (aturan global) ATAU benefit tier
  // member (per user) - dua sumber, tapi keduanya bermuara ke satu boolean
  // per baris supaya tetap satu jalur perhitungan total lewat calculateTotal(),
  // konsisten dengan yang dicocokkan webhook saat settlement.
  const freeFeeBenefit = hasBenefit(input.membership.benefits, "free_order_fee");
  const noUniqueCodeBenefit = hasBenefit(input.membership.benefits, "no_unique_code_order");
  // Fee dihitung dari harga SETELAH potongan voucher, bukan harga papan: fee
  // adalah biaya payment gateway atas nominal yang benar-benar ditagihkan, dan
  // menagih fee untuk uang yang tidak jadi lewat gateway hanya membuat potongan
  // yang dijanjikan terasa lebih kecil daripada yang tertulis.
  const net = netPrice(input.price, input.voucher);
  const fee = rules.feeOrder && !freeFeeBenefit ? calculateFee(net, method.feeFlat, method.feePercent) : 0n;
  const uniqueCode =
    rules.uniqueCodeOrder && !noUniqueCodeBenefit ? generateUniqueCode(rules.uniqueCodeMin, rules.uniqueCodeMax) : 0;
  const total = calculateTotal(net, fee, uniqueCode);

  const order = await createOrderWithRetry({
    orderNumber: input.orderNumber,
    status: "PENDING_PAYMENT",
    userId: input.userId,
    productItemId: input.item.id,
    productName: input.item.product.name,
    itemName: input.item.name,
    target: input.target,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    paidVia: "MIDTRANS",
    sellingPrice: input.price,
    fee,
    uniqueCode,
    total,
    paymentMethod: method.code,
    expiredAt,
    fulfillmentMode: input.fulfillmentMode,
    ...buildVoucherRedemption(input.voucher, input.userId),
    payment: { create: { method: method.code, status: "PENDING", expiredAt } },
  });
  // Ditembak duluan, di-await belakangan bareng orderPayment.update — history
  // insert ini tidak perlu selesai dulu sebelum manggil Midtrans, jadi latency-nya
  // numpuk di belakang panggilan Midtrans (yang jauh lebih lambat karena network
  // eksternal) alih-alih nambah 1 round-trip berurutan di depan.
  const historyPromise = db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "PENDING_PAYMENT", note: "Checkout" },
  });

  let chargedActions: PaymentActions;
  try {
    const actions = await createPaymentActions({
      methodCode: method.code,
      orderId: order.orderNumber,
      grossAmount: Number(total),
      expiryMinutes,
    });
    chargedActions = actions;
    await Promise.all([
      db.orderPayment.update({ where: { orderId: order.id }, data: { actions } }),
      historyPromise,
    ]);
  } catch (e) {
    const { failure, buyerMessage } = reportChargeFailure(
      { scope: "checkout", refId: order.orderNumber, method: method.code },
      e,
    );
    await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    // Alasan kegagalan ikut tersimpan (kolom rawResponse selama ini menganggur
    // di jalur gagal) supaya admin bisa membacanya dari detail order, bukan
    // dari log runtime yang sudah keburu hilang saat keluhan customer masuk.
    await db.orderPayment.update({
      where: { orderId: order.id },
      data: { status: "FAILED", rawResponse: failure },
    });
    await db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "FAILED",
        note: `Charge Midtrans gagal (${failure.kind}): ${failure.statusMessage ?? failure.message}`.slice(0, 500),
      },
    });
    return { error: buyerMessage };
  }

  try {
    await db.job.create({
      data: { type: "expire-order", payload: { orderId: order.id }, runAt: expiredAt },
    });
  } catch (e) {
    console.error("Checkout: gagal schedule job expire-order", { orderId: order.id, error: e });
    // tidak throw — order & pembayaran tetap valid untuk user, cuma auto-expire-nya berisiko tidak jalan
  }

  await sendOrderCreatedEmail(order, chargedActions);
  await notifyTelegram(
    "order_created",
    formatOrderCreatedMessage({
      orderNumber: order.orderNumber,
      productName: order.productName,
      itemName: order.itemName,
      total: order.total,
      target: describeOrderTarget(order.target),
      buyerLabel: order.buyerEmail,
      paymentMethod: order.paymentMethod,
    }),
  );
  return { ok: "Order dibuat.", orderNumber: order.orderNumber, publicToken: order.publicToken };
}
