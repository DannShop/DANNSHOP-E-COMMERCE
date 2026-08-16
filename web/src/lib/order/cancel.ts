import { db } from "@/lib/db";
import { cancelTransaction } from "@/lib/midtrans/client";
import { getMidtransRuntime } from "@/lib/payment/gateway-config";

// Pembatalan order yang belum dibayar. SATU tempat, dipakai admin maupun pembeli.
//
// ===== KENAPA STATUSNYA `EXPIRED`, BUKAN `CANCELLED` BARU =====
//
// Menambah nilai enum berarti migrasi DAN menyisir setiap tempat yang
// memperlakukan status order: label, daftar pelepas kuota voucher, daftar
// pelepas stok, laporan penjualan, analitik, filter panel admin. Yang terlewat
// satu saja menghasilkan order yang menggantung memegang kuota atau stok
// selamanya, tanpa error.
//
// `EXPIRED` sudah berarti persis hal yang sama secara uang - pesanan berakhir
// tanpa dibayar - dan sudah terdaftar di VOUCHER_RELEASING_STATUSES maupun
// STOCK_RELEASING_STATUSES, jadi membatalkan otomatis mengembalikan kuota
// voucher dan stok tanpa satu baris kode tambahan. Yang membedakan "kedaluwarsa
// sendiri" dari "dibatalkan" disimpan di catatan riwayat status, tempat yang
// memang dibaca manusia saat menelusuri satu pesanan.
export type CancelOrderResult = { ok?: string; error?: string };

export const ORDER_CANCELLED_OK = "Pesanan dibatalkan.";

/**
 * Membatalkan satu order yang masih menunggu pembayaran.
 *
 * HANYA `PENDING_PAYMENT` yang boleh dibatalkan lewat jalur ini - begitu uang
 * masuk, yang berlaku adalah refund (jalurnya sendiri, dengan pengembalian dana),
 * bukan pembatalan. Gerbangnya ditegakkan lewat updateMany berkondisi, bukan
 * lewat pembacaan status lebih dulu: dua permintaan yang datang bersamaan (admin
 * menekan Batalkan tepat saat webhook pembayaran tiba) hanya boleh membuat satu
 * di antaranya menang.
 */
export async function cancelPendingOrder(orderId: string, note: string): Promise<CancelOrderResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, paidVia: true },
  });
  if (!order) return { error: "Pesanan tidak ditemukan." };
  if (order.status !== "PENDING_PAYMENT") {
    return { error: "Pesanan ini sudah tidak bisa dibatalkan (statusnya sudah berubah)." };
  }

  const claimed = await db.order.updateMany({
    where: { id: order.id, status: "PENDING_PAYMENT" },
    data: { status: "EXPIRED" },
  });
  // Kalah balapan dengan webhook pembayaran atau job auto-expire.
  if (claimed.count === 0) {
    return { error: "Pesanan ini sudah tidak bisa dibatalkan (statusnya baru saja berubah)." };
  }

  await db.orderPayment.updateMany({ where: { orderId: order.id }, data: { status: "EXPIRED" } });
  await db.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: "PENDING_PAYMENT", toStatus: "EXPIRED", note },
  });

  // Transaksinya ikut dibatalkan DI SISI MIDTRANS, dan ini bukan sekadar
  // kerapian. Tanpa itu, QRIS/VA-nya tetap hidup sampai batas waktu aslinya:
  // pembeli yang sudah menekan "batalkan" masih bisa memindai kode yang belum
  // dia tutup, uangnya benar-benar terkirim, dan yang menerimanya adalah order
  // yang sudah kita nyatakan berakhir.
  //
  // Best-effort, sengaja tidak menggagalkan pembatalan kalau gagal: order kita
  // sudah sah berstatus EXPIRED, dan settlement.ts sudah menolak memproses
  // pembayaran yang datang ke order non-PENDING_PAYMENT sambil mengirim alert
  // Telegram - jadi uang nyasar tetap ketahuan, bukan hilang diam-diam.
  if (order.paidVia === "MIDTRANS") {
    try {
      const { creds } = await getMidtransRuntime();
      await cancelTransaction(order.orderNumber, creds);
    } catch (e) {
      console.error("cancelPendingOrder: gagal membatalkan transaksi Midtrans", {
        orderNumber: order.orderNumber,
        error: e,
      });
    }
  }

  return { ok: ORDER_CANCELLED_OK };
}
