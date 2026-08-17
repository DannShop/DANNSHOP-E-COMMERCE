import { db } from "@/lib/db";
import { getTransactionStatus, type MidtransStatusResult } from "@/lib/midtrans/client";
import { mapMidtransStatus } from "@/lib/midtrans/status-mapping";
import { getMidtransCreds } from "@/lib/payment/gateway-config";
import { dispatchFulfillment, escalateOrder } from "@/lib/order/fulfillment";
import { formatDepositPaidMessage, formatOrderPaidMessage, notifyTelegram } from "@/lib/notify/telegram";
import { describeOrderTarget } from "@/lib/order/customer-no";

// Logika settlement pembayaran Midtrans - dipindahkan ke sini dari
// api/webhooks/midtrans/route.ts karena sekarang punya DUA pemanggil:
//
//   1. Webhook Midtrans (jalur normal, dipicu Midtrans)
//   2. Lazy reconcile di endpoint status (jaring pengaman, dipicu polling
//      browser) - lihat lib/payment/reconcile.ts
//
// Sengaja dipindah, BUKAN disalin: ini jalur yang mengkredit saldo member dan
// men-dispatch fulfillment ke provider. Dua salinan yang bisa menyimpang
// diam-diam adalah risiko uang nyata, bukan sekadar duplikasi kode.
//
// Aman dipanggil berkali-kali dari jalur mana pun. Keamanannya bukan dari
// pemanggil yang tertib, tapi dari dua mekanisme di bawah:
//   - klaim atomik `updateMany({ where: { status: PENDING... } })` - hanya satu
//     pemanggil yang bisa memenangkan transisi status
//   - `idempotencyKey` unik di WalletLedger - kredit ganda ditolak database

async function settleOrder(
  order: { id: string; orderNumber: string; total: bigint },
  confirmed: MidtransStatusResult,
): Promise<string> {
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== order.total) {
    console.error("settleOrder: nominal settlement tidak cocok, escalate", {
      orderId: order.id, expected: order.total.toString(), received: confirmed.grossAmount,
    });
    await escalateOrder({
      orderId: order.id, orderNumber: order.orderNumber, toStatus: "NEEDS_REVIEW",
      note: "Nominal settlement tidak cocok dengan total order",
    });
    return "amount_mismatch";
  }

  if (mapped === "paid") {
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: "PAID" },
    });
    if (claimed.count > 0) {
      await db.orderPayment.update({
        where: { orderId: order.id },
        data: { status: "PAID", rawResponse: confirmed.raw as object },
      });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "PAID", note: "Midtrans settlement" },
      });
      // Dikirim SEBELUM dispatch supaya admin tetap tahu uangnya masuk walau
      // pengiriman ke provider setelah ini gagal total. Event ini default MATI
      // (lihat DEFAULT_ENABLED_EVENTS) - toko ramai tidak mau satu notifikasi
      // per pembayaran, tapi toko baru biasanya justru mau.
      const paidOrder = await db.order.findUnique({ where: { id: order.id } });
      if (paidOrder) {
        await notifyTelegram(
          "order_paid",
          formatOrderPaidMessage({
            orderNumber: paidOrder.orderNumber,
            productName: paidOrder.productName,
            itemName: paidOrder.itemName,
            total: paidOrder.total,
            target: describeOrderTarget(paidOrder.target),
            buyerLabel: paidOrder.buyerEmail,
            paymentMethod: paidOrder.paymentMethod,
          }),
        );
      }
      await dispatchFulfillment(order.id);
    } else {
      // Order sudah bukan PENDING_PAYMENT lagi - kemungkinan webhook retry
      // setelah percobaan sebelumnya sempat klaim PAID tapi belum sempat
      // dispatch. dispatchFulfillment aman dipanggil ulang (klaim atomik
      // PAID->PROCESSING di dalamnya, no-op kalau sudah PROCESSING/lain).
      const current = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (current?.status === "PAID") {
        await dispatchFulfillment(order.id);
      } else {
        // Settlement "paid" asli datang tapi order sudah di status lain yang tidak PAID/PENDING_PAYMENT
        // (mis. EXPIRED karena delivery webhook sebelumnya sempat starved) - order ini TIDAK
        // otomatis diproses dari sini. Log supaya kejadian ini terlihat di production, bukan
        // hilang diam-diam (mirror pola log di settleDeposit untuk kasus setara).
        console.error(
          "settleOrder: settlement 'paid' datang setelah order tidak lagi PENDING_PAYMENT/PAID - perlu investigasi manual",
          { orderId: order.id, statusSaatIni: current?.status, orderNumber: order.orderNumber },
        );
        await notifyTelegram(
          "system_anomaly",
          `⚠️ Order ${order.orderNumber} settlement Midtrans datang setelah status jadi "${current?.status}" (bukan PENDING_PAYMENT/PAID) - order TIDAK diproses otomatis, perlu investigasi manual.`,
        );
      }
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    const claimed = await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT" },
      data: { status: newStatus },
    });
    if (claimed.count > 0) {
      await db.orderPayment.update({ where: { orderId: order.id }, data: { status: newStatus } });
      await db.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: newStatus, note: "Midtrans notification" },
      });
    }
  }

  return mapped;
}

async function settleDeposit(
  deposit: { id: string; totalPaid: bigint },
  confirmed: MidtransStatusResult,
): Promise<string> {
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== deposit.totalPaid) {
    console.error("settleDeposit: nominal settlement tidak cocok, saldo TIDAK dikredit", {
      depositId: deposit.id, expected: deposit.totalPaid.toString(), received: confirmed.grossAmount,
    });
    await notifyTelegram(
      "system_anomaly",
      `⚠️ Deposit ${deposit.id} nominal settlement TIDAK COCOK (expected Rp ${deposit.totalPaid.toString()}, diterima ${confirmed.grossAmount}) - saldo TIDAK dikredit, perlu investigasi manual.`,
    );
    return "amount_mismatch";
  }

  if (mapped === "paid") {
    let claimedCount = 0;
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.deposit.updateMany({
          where: { id: deposit.id, status: "PENDING" },
          data: { status: "PAID" },
        });
        claimedCount = claimed.count;
        if (claimed.count > 0) {
          const full = await tx.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
          // amount + bonusAmount dikreditkan BERSAMA dalam satu increment +
          // satu baris ledger (bukan dua transaksi terpisah) - bonusAmount
          // sudah disnapshot saat deposit dibuat (lihat actions/deposit.ts),
          // jadi di sini tinggal dijumlah, tidak perlu resolve tier lagi.
          const credited = full.amount + full.bonusAmount;
          const wallet = await tx.wallet.update({
            where: { userId: full.userId },
            data: { balance: { increment: credited } },
          });
          await tx.walletLedger.create({
            data: {
              walletId: wallet.id,
              type: "DEPOSIT",
              amount: credited,
              balanceAfter: wallet.balance,
              referenceType: "deposit",
              referenceId: full.id,
              idempotencyKey: `deposit:${full.id}`,
              note: full.bonusAmount > 0n ? `Termasuk bonus tier Rp${full.bonusAmount.toString()}` : null,
            },
          });
        }
      });
    } catch (e) {
      console.error("settleDeposit: gagal kredit saldo", { depositId: deposit.id, error: e });
      throw e;
    }

    // Notifikasi dibaca ulang SETELAH transaksi ditutup, bukan dikumpulkan di
    // dalamnya: panggilan jaringan ke Telegram tidak boleh menahan transaksi
    // yang sedang memegang kunci baris wallet. Hanya dikirim kalau klaim ini
    // yang berhasil - notifikasi duplikat dari webhook retry tidak diinginkan.
    if (claimedCount > 0) {
      const settled = await db.deposit.findUnique({
        where: { id: deposit.id },
        select: { amount: true, bonusAmount: true, user: { select: { name: true, email: true, wallet: { select: { balance: true } } } } },
      });
      if (settled) {
        await notifyTelegram(
          "deposit_paid",
          formatDepositPaidMessage({
            depositId: deposit.id,
            userLabel: `${settled.user.name} <${settled.user.email}>`,
            amount: settled.amount,
            bonusAmount: settled.bonusAmount,
            balanceAfter: settled.user.wallet?.balance ?? 0n,
          }),
        );
      }
    }

    if (claimedCount === 0) {
      // Deposit sudah bukan PENDING lagi saat settlement "paid" ini masuk.
      // Cek status terkini: kalau sudah PAID, ini cuma notifikasi duplikat
      // (aman, no-op). Tapi kalau statusnya EXPIRED/FAILED, berarti dana
      // sudah masuk di Midtrans tapi saldo member TIDAK pernah dikredit -
      // kemungkinan race dengan job expire-deposit.
      const current = await db.deposit.findUnique({ where: { id: deposit.id }, select: { status: true } });
      if (current?.status !== "PAID") {
        console.error(
          "settleDeposit: settlement 'paid' datang setelah deposit tidak lagi PENDING - saldo BELUM dikredit, perlu investigasi manual",
          { depositId: deposit.id, statusSaatIni: current?.status },
        );
        await notifyTelegram(
          "system_anomaly",
          `⚠️ Deposit ${deposit.id} settlement Midtrans datang setelah status jadi "${current?.status}" (bukan PENDING) - saldo BELUM dikredit, perlu investigasi manual.`,
        );
        return "paid_but_not_pending";
      }
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    await db.deposit.updateMany({ where: { id: deposit.id, status: "PENDING" }, data: { status: newStatus } });
  }

  return mapped;
}

/**
 * Memberikan paket reseller setelah pembayarannya benar-benar masuk.
 *
 * Pola idempotensinya sama persis dengan settleDeposit: klaim atomik lewat
 * `updateMany ... where status: "PENDING"`. Webhook Midtrans mengirim ulang
 * notifikasi yang sama berkali-kali, dan tanpa klaim ini paket bisa diberikan
 * dua kali - yang di sini berarti `tierPricePaid` tertimpa dua kali dan kredit
 * upgrade berikutnya jadi salah.
 */
async function settleTierPurchase(
  purchase: { id: string; totalPaid: bigint },
  confirmed: MidtransStatusResult,
): Promise<string> {
  const mapped = mapMidtransStatus(confirmed.transactionStatus, confirmed.fraudStatus);

  // Nominal WAJIB cocok sebelum paket diberikan. Penjaga yang sama dipakai
  // deposit: kalau yang dibayar berbeda dari yang ditagih, yang benar adalah
  // berhenti dan memanggil manusia - bukan menebak mana yang dimaksud.
  if (mapped === "paid" && BigInt(Math.round(Number(confirmed.grossAmount))) !== purchase.totalPaid) {
    console.error("settleTierPurchase: nominal tidak cocok, paket TIDAK diberikan", {
      purchaseId: purchase.id,
      expected: purchase.totalPaid.toString(),
      received: confirmed.grossAmount,
    });
    await notifyTelegram(
      "system_anomaly",
      `⚠️ Pembelian paket reseller ${purchase.id} nominal settlement TIDAK COCOK (ditagih Rp ${purchase.totalPaid.toString()}, diterima ${confirmed.grossAmount}) - paket TIDAK diberikan, perlu investigasi manual.`,
    );
    return "amount_mismatch";
  }

  if (mapped === "paid") {
    let claimedCount = 0;
    await db.$transaction(async (tx) => {
      const claimed = await tx.tierPurchase.updateMany({
        where: { id: purchase.id, status: "PENDING" },
        data: { status: "PAID" },
      });
      claimedCount = claimed.count;
      if (claimed.count === 0) return;

      const full = await tx.tierPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
      // `tierPricePaid` disetel ke HARGA PAKET, bukan ke jumlah yang barusan
      // ditransfer. Yang dicatat adalah "sudah membayar penuh sebesar harga
      // paket ini" - kredit dari paket sebelumnya memang bagian dari harga itu.
      // Kalau yang dicatat cuma selisihnya, upgrade berikutnya akan mengkredit
      // jauh lebih kecil dari yang benar-benar sudah dibayar orang ini.
      await tx.resellerAccount.update({
        where: { id: full.resellerId },
        data: { tierId: full.tierId, tierPricePaid: full.tierPrice },
      });
    });

    if (claimedCount === 0) {
      const current = await db.tierPurchase.findUnique({
        where: { id: purchase.id },
        select: { status: true },
      });
      if (current?.status !== "PAID") {
        console.error(
          "settleTierPurchase: settlement 'paid' datang setelah status bukan PENDING - paket BELUM diberikan",
          { purchaseId: purchase.id, statusSaatIni: current?.status },
        );
        await notifyTelegram(
          "system_anomaly",
          `⚠️ Pembelian paket reseller ${purchase.id} dibayar SETELAH statusnya jadi "${current?.status}" - paket BELUM diberikan, perlu investigasi manual.`,
        );
        return "paid_but_not_pending";
      }
    }
  } else if (mapped === "failed" || mapped === "expired") {
    const newStatus = mapped === "expired" ? "EXPIRED" : "FAILED";
    await db.tierPurchase.updateMany({
      where: { id: purchase.id, status: "PENDING" },
      data: { status: newStatus },
    });
  }

  return mapped;
}

// Titik masuk tunggal untuk kedua pemanggil (webhook & lazy reconcile).
//
// `externalRef` adalah order_id di sisi Midtrans, yang di sistem kita berarti
// Order.orderNumber ATAU Deposit.id - keduanya dicoba, sesuai cara webhook
// selama ini bekerja (Deposit tidak punya nomor publik terpisah seperti Order).
//
// Status SELALU dikonfirmasi ulang lewat panggilan GET status ke Midtrans,
// tidak pernah percaya pada isi payload webhook - payload cuma dipakai sebagai
// pemicu. Ini yang membuat jalur reconcile (yang memang tidak punya payload)
// bisa memakai fungsi yang sama persis.
export async function settleFromMidtrans(externalRef: string): Promise<string> {
  const creds = await getMidtransCreds();
  const order = await db.order.findUnique({
    where: { orderNumber: externalRef },
    select: { id: true, orderNumber: true, total: true },
  });
  if (order) {
    const confirmed = await getTransactionStatus(externalRef, creds);
    return settleOrder(order, confirmed);
  }

  const deposit = await db.deposit.findUnique({
    where: { id: externalRef },
    select: { id: true, totalPaid: true },
  });
  if (deposit) {
    const confirmed = await getTransactionStatus(externalRef, creds);
    return settleDeposit(deposit, confirmed);
  }

  const purchase = await db.tierPurchase.findUnique({
    where: { id: externalRef },
    select: { id: true, totalPaid: true },
  });
  if (purchase) {
    const confirmed = await getTransactionStatus(externalRef, creds);
    return settleTierPurchase(purchase, confirmed);
  }

  return "order_not_found";
}
