import { db } from "@/lib/db";
import { settleFromMidtrans } from "@/lib/payment/settlement";

// Jaring pengaman kalau webhook Midtrans tidak pernah sampai.
//
// Sebelum ini, satu-satunya jalur PENDING -> PAID adalah webhook. Kalau URL
// webhook belum terpasang di dashboard Midtrans, atau environment-nya tidak
// bisa dijangkau dari internet (tes di localhost), pembayaran yang SUDAH
// dibayar customer akan menggantung sampai EXPIRED tanpa jejak error apa pun.
// Ini berlaku sama rata untuk QRIS, VA, echannel, maupun e-wallet - semuanya
// bergantung pada webhook yang sama.
//
// Solusinya: setiap kali browser polling status dan transaksinya masih PENDING,
// tarik status langsung ke Midtrans lalu jalankan logika settlement yang SAMA
// PERSIS dengan webhook (lib/payment/settlement.ts).

// Halaman invoice polling tiap 3 detik. Tanpa throttle, satu tab terbuka akan
// menembak API Midtrans 20x/menit untuk satu transaksi. 20 detik menurunkannya
// jadi maksimum 3x/menit per transaksi, masih jauh lebih cepat daripada
// menunggu customer menghubungi CS.
//
// Throttle ini juga yang menahan endpoint status order (publik, hanya
// berbekal token invoice) dari dipakai memicu panggilan Midtrans bertubi-tubi.
const RECONCILE_THROTTLE_MS = 20_000;

function isStale(updatedAt: Date, now: number): boolean {
  return now - updatedAt.getTime() >= RECONCILE_THROTTLE_MS;
}

// Mengembalikan true kalau reconcile benar-benar dijalankan - pemanggil harus
// membaca ulang record dari DB sebelum menyusun response, karena statusnya
// mungkin baru saja berubah.
//
// TIDAK PERNAH melempar error. Reconcile adalah jaring pengaman, bukan
// dependensi halaman invoice: kalau Midtrans sedang down, halaman status wajib
// tetap tampil dengan data DB apa adanya.
export async function maybeReconcileOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  paidVia: string | null;
  payment: { status: string; updatedAt: Date } | null;
}): Promise<boolean> {
  if (order.status !== "PENDING_PAYMENT") return false;
  if (order.paidVia !== "MIDTRANS") return false;
  if (!order.payment || order.payment.status !== "PENDING") return false;
  if (!isStale(order.payment.updatedAt, Date.now())) return false;

  // Tandai percobaan DULUAN, sebelum memanggil Midtrans. Kalau penandaan
  // dilakukan belakangan, panggilan yang gagal/lambat tidak akan menggeser
  // jendela throttle dan polling berikutnya (3 detik lagi) langsung mencoba
  // lagi - persis perilaku bertubi-tubi yang mau dicegah. Klaim bersyarat
  // `status: "PENDING"` mencegah penulisan ini menimpa transisi PAID yang
  // mungkin baru saja dimenangkan webhook di saat yang sama.
  const claimed = await db.orderPayment.updateMany({
    where: { orderId: order.id, status: "PENDING" },
    data: { updatedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  try {
    await settleFromMidtrans(order.orderNumber);
  } catch (e) {
    console.error("maybeReconcileOrder: gagal tarik status dari Midtrans", {
      orderNumber: order.orderNumber,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return true;
}

export async function maybeReconcileDeposit(deposit: {
  id: string;
  status: string;
  updatedAt: Date;
}): Promise<boolean> {
  if (deposit.status !== "PENDING") return false;
  if (!isStale(deposit.updatedAt, Date.now())) return false;

  const claimed = await db.deposit.updateMany({
    where: { id: deposit.id, status: "PENDING" },
    data: { updatedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  try {
    await settleFromMidtrans(deposit.id);
  } catch (e) {
    console.error("maybeReconcileDeposit: gagal tarik status dari Midtrans", {
      depositId: deposit.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return true;
}
