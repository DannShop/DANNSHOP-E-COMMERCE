import type { OrderStatus } from "@prisma/client";

/**
 * Status order yang membuat produk/item TIDAK boleh dihapus.
 *
 * Ini penjaga uang, bukan penjaga kerapian data. lib/order/fulfillment.ts
 * membaca ulang ProductItem dengan `findUniqueOrThrow` di TIGA titik — saat
 * dispatch, saat failover ke provider cadangan, dan saat recheck status. Kalau
 * itemnya sudah dihapus, ketiganya melempar; job-nya habis 5 percobaan lalu mati
 * dengan pesan Prisma "No ProductItem found" yang tidak menyebut sebab
 * sesungguhnya. Hasil akhirnya: pembeli sudah bayar, barang tidak pernah
 * terkirim, dan tidak ada satu pun layar yang menunjuk penghapusan sebagai
 * penyebabnya.
 *
 * REFUND_PENDING ikut memblokir walau ordernya sudah "batal": uangnya masih
 * bergerak dan alur refund masih akan menyentuh order itu.
 *
 * Status TUNTAS (COMPLETED, EXPIRED, FAILED, REFUNDED) sengaja TIDAK memblokir.
 * Order menyimpan snapshot productName, itemName, sellingPrice, dan
 * fulfillmentMode, jadi halaman order lama tetap utuh tanpa ProductItem-nya.
 * Kalau status ini ikut memblokir, produk yang pernah laku sekali saja tidak
 * akan pernah bisa dibersihkan selamanya.
 */
export const ORDER_STATUSES_BLOCKING_DELETE: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "NEEDS_REVIEW",
  "REFUND_PENDING",
];

/** Berapa nomor order yang disebut utuh sebelum sisanya diringkas. */
const SAMPLE_LIMIT = 3;

/**
 * Kalimat penolakan, atau null kalau aman dihapus.
 *
 * Nomor ordernya DISEBUT, bukan cuma jumlahnya: "tidak bisa dihapus" tanpa nomor
 * memaksa admin menebak-nebak di halaman Orders untuk menemukan mana yang
 * menghalangi. Dibatasi beberapa nomor saja supaya kalimatnya tetap terbaca
 * kalau yang menghalangi ada puluhan.
 */
export function describeDeleteBlock(
  orders: { orderNumber: string; status: OrderStatus }[],
): string | null {
  if (orders.length === 0) return null;

  const sample = orders.slice(0, SAMPLE_LIMIT).map((o) => o.orderNumber);
  const rest = orders.length - sample.length;
  const daftar = rest > 0 ? `${sample.join(", ")}, dan ${rest} lainnya` : sample.join(", ");

  return (
    `Masih ada ${orders.length} order yang belum tuntas memakai ini: ${daftar}. ` +
    `Selesaikan atau batalkan order itu dulu — menghapus sekarang membuat pengirimannya gagal ` +
    `padahal pembeli sudah bayar.`
  );
}
