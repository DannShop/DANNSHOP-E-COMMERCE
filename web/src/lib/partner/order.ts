import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateOrderNumber } from "@/lib/order/order-number";
import { selectFulfillmentSku } from "@/lib/order/select-provider";
import { dispatchFulfillment } from "@/lib/order/fulfillment";
import { getActiveProviders } from "@/lib/providers/registry";
import { checkStockAvailable } from "@/lib/catalog/stock";
import { effectivePrice } from "@/lib/pricing/effective-price";
import { getMembershipContext } from "@/lib/membership/tier";
import { describeOrderTarget } from "@/lib/order/customer-no";
import { formatOrderPaidMessage, notifyTelegram } from "@/lib/notify/telegram";
import { parseCustomerNo } from "@/lib/partner/signature";
import { PARTNER_RC, type PartnerRc } from "@/lib/partner/response";
import type { AuthedPartner } from "@/lib/partner/auth";
import { generatePublicToken } from "@/lib/order/public-token";

export interface PartnerOrderSuccess {
  ok: true;
  order: {
    id: string;
    orderNumber: string;
    productName: string;
    itemName: string;
    sellingPrice: bigint;
    status: string;
  };
  balance: bigint;
  /** true = ref_id ini sudah pernah diproses; tidak ada order/debit baru dibuat. */
  replayed: boolean;
}

export interface PartnerOrderFailure {
  ok: false;
  rc: PartnerRc;
  message: string;
  httpStatus: number;
}

class InsufficientBalanceError extends Error {}

async function walletBalance(userId: string): Promise<bigint> {
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return wallet?.balance ?? 0n;
}

/**
 * Membuat satu order atas nama partner dan langsung mendebit saldonya.
 *
 * Ini cerminan createBalanceOrder() di actions/checkout.ts — pola debit atomik,
 * ledger, dan urutan status yang sama persis. Sengaja TIDAK memanggil ulang
 * createCheckoutOrder(): action itu terikat FormData, sesi NextAuth, dan
 * rate-limit tamu berbasis IP yang tidak satu pun berlaku di jalur H2H, dan
 * membengkokkannya agar muat akan menambah cabang ke jalur uang yang paling ramai
 * dipakai di seluruh aplikasi. Yang dibagi bersama justru bagian yang berbahaya
 * kalau menyimpang: effectivePrice(), selectFulfillmentSku(), dispatchFulfillment().
 */
export async function createPartnerOrder(input: {
  partner: AuthedPartner;
  refId: string;
  sku: string;
  customerNo: string;
}): Promise<PartnerOrderSuccess | PartnerOrderFailure> {
  const { partner, refId, sku, customerNo } = input;

  const item = await db.productItem.findUnique({
    where: { id: sku },
    include: { product: true, providerSkus: true },
  });
  if (!item || !item.isActive || !item.product.isActive) {
    return {
      ok: false,
      rc: PARTNER_RC.SKU_NOT_FOUND,
      message: `SKU "${sku}" tidak ditemukan atau sedang tidak aktif. Ambil daftar terbaru lewat /api/v1/price-list.`,
      httpStatus: 404,
    };
  }

  // Produk manual (App Premium dsb) sengaja ditutup untuk API partner. Uangnya
  // akan tertagih dan order-nya berhenti di PROCESSING menunggu admin kita
  // mengirim barangnya sendiri — dari sisi partner itu tampak seperti transaksi
  // yang menggantung tanpa batas waktu, dan mereka tidak punya cara apa pun
  // untuk mempercepatnya. Lebih jujur ditolak di depan.
  if (item.product.fulfillmentMode === "MANUAL") {
    return {
      ok: false,
      rc: PARTNER_RC.PRODUCT_UNAVAILABLE,
      message: "Produk ini dikirim manual dan tidak tersedia lewat API partner.",
      httpStatus: 400,
    };
  }

  // Produk yang tidak dibuka untuk mitra ditolak DI SINI juga, bukan hanya
  // disembunyikan dari price list. Menyaringnya di katalog saja adalah lubang
  // yang nyata: SKU adalah id yang stabil, jadi mitra yang pernah menariknya
  // sebelum admin mematikan flag ini — atau yang menyimpan katalognya, seperti
  // yang justru kita anjurkan — akan tetap bisa memesannya selamanya.
  if (!item.product.partnerVisible) {
    return {
      ok: false,
      rc: PARTNER_RC.PRODUCT_UNAVAILABLE,
      message: "Produk ini tidak tersedia untuk mitra. Perbarui katalog kamu lewat /api/v1/price-list.",
      httpStatus: 400,
    };
  }

  const inputFields = item.product.inputFields as { name: string; label: string }[];
  const parsedTarget = parseCustomerNo(inputFields, customerNo);
  if (!parsedTarget.ok) {
    return { ok: false, rc: PARTNER_RC.INVALID_CUSTOMER_NO, message: parsedTarget.error!, httpStatus: 400 };
  }
  const target = parsedTarget.target!;

  // Replay: ref_id yang sudah pernah masuk mengembalikan transaksi ASLINYA, bukan
  // error. Inilah yang membuat retry partner setelah timeout jaringan aman —
  // tanpa ini, partner yang tidak menerima respons kita akan mengirim ulang dan
  // (kalau constraint unique tidak ada) membeli dua kali.
  //
  // Kecuali kalau isi request-nya BERBEDA: itu bukan retry, itu ref_id yang
  // dipakai ulang untuk transaksi lain — bug di sisi partner yang harus berisik,
  // bukan diam-diam mengembalikan status transaksi yang salah.
  const existing = await db.order.findFirst({
    where: { partnerId: partner.id, partnerRefId: refId },
  });
  if (existing) {
    const sameRequest =
      existing.productItemId === sku &&
      describeOrderTarget(existing.target) === describeOrderTarget(target);
    if (!sameRequest) {
      return {
        ok: false,
        rc: PARTNER_RC.DUPLICATE_REF_ID,
        message: `ref_id "${refId}" sudah dipakai untuk transaksi lain. Gunakan ref_id yang unik per transaksi.`,
        httpStatus: 409,
      };
    }
    return {
      ok: true,
      replayed: true,
      order: {
        id: existing.id,
        orderNumber: existing.orderNumber,
        productName: existing.productName,
        itemName: existing.itemName,
        sellingPrice: existing.sellingPrice,
        status: existing.status,
      },
      balance: await walletBalance(partner.userId),
    };
  }

  const now = new Date();
  const [activeProviders, membership] = await Promise.all([
    getActiveProviders(),
    getMembershipContext(partner.userId),
  ]);

  // Harga partner = harga jual dikurangi diskon tier yang dimiliki akun partner,
  // lewat jalur yang sama persis dengan storefront. Tidak ada tabel harga khusus
  // partner: admin cukup memberi akun partner sebuah tier (Admin -> Kontrol User)
  // dan margin resellernya mengikuti. Satu sumber harga, bukan dua yang harus
  // dijaga tetap sinkron.
  const price = effectivePrice(item, { discountBp: membership.discountBp, now });

  const decision = selectFulfillmentSku({ sellingPrice: price }, item.providerSkus, activeProviders);
  if (!decision.ok) {
    return {
      ok: false,
      rc: PARTNER_RC.PRODUCT_UNAVAILABLE,
      message: "Produk sedang tidak tersedia, coba beberapa saat lagi.",
      httpStatus: 503,
    };
  }

  // Gerbang stok ditegakkan DI SINI JUGA, bukan cuma di storefront. Menyaringnya
  // di satu pintu saja adalah lubang yang nyata: mitra memesan lewat API dan
  // menyimpan katalognya sendiri, jadi tanpa gerbang ini stok yang sudah habis
  // tetap bisa ditarik habis-habisan lewat /api/v1/transaction sementara pembeli
  // storefront sudah ditolak. Pola yang sama dengan penegakan partnerVisible.
  const stockError = await checkStockAvailable(item);
  if (stockError) {
    return { ok: false, rc: PARTNER_RC.PRODUCT_UNAVAILABLE, message: stockError, httpStatus: 409 };
  }

  // Cek saldo di depan HANYA untuk memberi pesan error yang benar sebelum order
  // dibuat. Penjamin sesungguhnya tetap debit atomik di bawah — di antara dua
  // titik ini saldo bisa berubah karena transaksi partner yang lain.
  if ((await walletBalance(partner.userId)) < price) {
    return {
      ok: false,
      rc: PARTNER_RC.INSUFFICIENT_BALANCE,
      message: "Saldo tidak mencukupi untuk transaksi ini.",
      httpStatus: 402,
    };
  }

  let order;
  try {
    order = await createPartnerOrderRow({
      partnerId: partner.id,
      partnerRefId: refId,
      userId: partner.userId,
      item,
      price,
      target,
      now,
    });
  } catch (e) {
    // Race: dua request dengan ref_id sama tiba bersamaan dan yang satu lagi
    // menang. Constraint unique-lah yang menangkapnya, bukan pengecekan di atas.
    if (isDuplicateRefId(e)) {
      return {
        ok: false,
        rc: PARTNER_RC.DUPLICATE_REF_ID,
        message: `ref_id "${refId}" sedang diproses. Cek statusnya lewat /api/v1/transaction/status.`,
        httpStatus: 409,
      };
    }
    throw e;
  }

  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      toStatus: "PENDING_PAYMENT",
      note: `Order API partner ${partner.username} (ref_id ${refId})`,
    },
  });

  try {
    await db.$transaction(async (tx) => {
      const debited = await tx.wallet.updateMany({
        where: { userId: partner.userId, balance: { gte: order.total } },
        data: { balance: { decrement: order.total } },
      });
      if (debited.count === 0) throw new InsufficientBalanceError();

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: partner.userId } });
      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "ORDER_PAYMENT",
          amount: -order.total,
          balanceAfter: wallet.balance,
          referenceType: "order",
          referenceId: order.id,
          // Kunci yang SAMA PERSIS dengan jalur checkout saldo — jalur auto-refund
          // di fulfillment.ts memakai pasangannya (`order-refund:<id>`), jadi order
          // partner ikut terlindungi dari double-credit tanpa kode tambahan.
          idempotencyKey: `order-payment:${order.id}`,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      await tx.orderPayment.update({ where: { orderId: order.id }, data: { status: "PAID" } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Debit saldo partner" },
      });
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      await db.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      await db.orderPayment.update({ where: { orderId: order.id }, data: { status: "FAILED" } });
      await db.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "FAILED",
          note: "Saldo partner tidak cukup",
        },
      });
      return {
        ok: false,
        rc: PARTNER_RC.INSUFFICIENT_BALANCE,
        message: "Saldo tidak mencukupi untuk transaksi ini.",
        httpStatus: 402,
      };
    }
    throw e;
  }

  await notifyTelegram(
    "order_paid",
    formatOrderPaidMessage({
      orderNumber: order.orderNumber,
      productName: order.productName,
      itemName: order.itemName,
      total: order.total,
      target: describeOrderTarget(order.target),
      buyerLabel: `Partner: ${partner.username}`,
      paymentMethod: "Saldo Partner",
    }),
  );

  // Sengaja di-await, bukan dilepas di belakang: partner memanggil API ini secara
  // sinkron dan berhak mendapat status paling akhir yang kita ketahui. Digiflazz
  // umumnya membalas "Pending" dalam hitungan ratusan milidetik, dan kalaupun
  // panggilannya melempar, dispatchFulfillment sudah menjadwalkan job
  // recheck-fulfillment lebih dulu sehingga order tidak pernah menggantung.
  await dispatchFulfillment(order.id);

  const finalOrder = await db.order.findUniqueOrThrow({
    where: { id: order.id },
    select: {
      id: true,
      orderNumber: true,
      productName: true,
      itemName: true,
      sellingPrice: true,
      status: true,
    },
  });

  return { ok: true, replayed: false, order: finalOrder, balance: await walletBalance(partner.userId) };
}

function isDuplicateRefId(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    Array.isArray(e.meta?.target) &&
    (e.meta!.target as string[]).includes("partnerRefId")
  );
}

// Order number bisa bertabrakan (4 digit acak per hari) — sama seperti
// createOrderWithRetry() di checkout.ts, sekali retry sudah cukup. Dibedakan
// dari tabrakan partnerRefId, yang justru TIDAK boleh di-retry.
async function createPartnerOrderRow(input: {
  partnerId: string;
  partnerRefId: string;
  userId: string;
  item: { id: string; name: string; product: { name: string } };
  price: bigint;
  target: Record<string, string>;
  now: Date;
}) {
  const data = {
    orderNumber: generateOrderNumber(input.now),
    status: "PENDING_PAYMENT" as const,
    userId: input.userId,
    partnerId: input.partnerId,
    partnerRefId: input.partnerRefId,
    productItemId: input.item.id,
    productName: input.item.product.name,
    itemName: input.item.name,
    target: input.target,
    paidVia: "BALANCE" as const,
    sellingPrice: input.price,
    total: input.price,
    paymentMethod: "balance",
    fulfillmentMode: "AUTO" as const,
    payment: { create: { method: "balance", status: "PENDING" as const } },
    // Order lewat API partner tetap punya halaman invoice publik, jadi tokennya
    // harus sekuat jalur storefront — lihat lib/order/public-token.ts.
    publicToken: generatePublicToken(),
  };
  try {
    return await db.order.create({ data });
  } catch (e) {
    if (isDuplicateRefId(e)) throw e;
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      Array.isArray(e.meta?.target) &&
      (e.meta!.target as string[]).includes("orderNumber")
    ) {
      return db.order.create({ data: { ...data, orderNumber: generateOrderNumber(new Date()) } });
    }
    throw e;
  }
}
