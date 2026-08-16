import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Stok per item.
//
// ===== KENAPA SISA STOK DITURUNKAN, BUKAN DISIMPAN DI KOLOM =====
//
// Rancangan yang jelas: kolom `stock` dikurangi saat order masuk, dikembalikan
// saat ordernya gagal. Rancangan itu ditolak dengan sengaja, alasannya sama
// persis dengan kuota voucher (lihat lib/voucher/usage.ts).
//
// Status order berpindah ke keadaan gagal di DELAPAN tempat: job auto-expire,
// dua cabang settlement webhook, dua jalur refund fulfillment, refund manual
// admin, charge Midtrans gagal, dan saldo tidak cukup. Counter menuntut
// kedelapannya ingat mengembalikan stok, selamanya, termasuk oleh orang yang
// menambahkan jalur kesembilan besok tanpa pernah membaca catatan ini. Dan yang
// lupa TIDAK menimbulkan error apa pun - cuma stok yang menyusut diam-diam
// sampai barang yang masih ada dinyatakan habis.
//
// Dengan diturunkan dari status order, tidak ada yang perlu diingat siapa pun:
// order yang gagal berhenti memakai jatah dengan sendirinya, di kedelapan jalur
// sekaligus, termasuk jalur yang belum ditulis.
//
// ===== KENAPA ORDER YANG BELUM DIBAYAR IKUT MEMEGANG JATAH =====
//
// Keputusan Wildan (2026-08-16): stok ditahan sejak checkout, bukan sejak
// pengiriman berhasil. Kalau cuma order sukses yang dihitung, sepuluh orang bisa
// checkout bersamaan pada stok 1, semuanya membayar, lalu sembilan di antaranya
// harus direfund manual - kelebihan jual yang menimbulkan komplain, bukan sekadar
// angka yang meleset. Order yang tidak dibayar melepas jatahnya sendiri begitu
// kedaluwarsa (30 menit), lewat jalur yang sama dengan yang gagal.

/**
 * Status yang berarti "order ini tidak jadi" - jatah stoknya dilepas.
 *
 * Daftarnya SENGAJA sama dengan VOUCHER_RELEASING_STATUSES. NEEDS_REVIEW dan
 * REFUND_PENDING tidak ada di sini, dan itu disengaja: uangnya sudah masuk dan
 * perkaranya masih ditangani admin - melepas stoknya sekarang berarti barang
 * yang sama bisa dijual ke orang lain sementara pesanan aslinya masih mungkin
 * diselesaikan.
 */
export const STOCK_RELEASING_STATUSES: OrderStatus[] = ["FAILED", "EXPIRED", "REFUNDED"];

/** Order yang masih memegang jatah stok. */
const MASIH_MEMEGANG: Prisma.OrderWhereInput = {
  status: { notIn: STOCK_RELEASING_STATUSES },
};

/** Pesan tolak tunggal - dipakai storefront maupun API mitra. */
export const OUT_OF_STOCK_MESSAGE = "Stok item ini sedang habis. Coba lagi nanti atau pilih nominal lain.";

/**
 * Sisa stok. `null` berarti TAK TERBATAS, bukan nol - bedanya penting, dan
 * itulah kenapa fungsi ini tidak boleh dipangkas jadi sekadar pengurangan.
 *
 * Hasilnya dijepit di 0: kalau stok pernah diturunkan admin di bawah jumlah
 * order yang sedang berjalan, angka minus di layar cuma membingungkan tanpa
 * memberi tahu apa pun yang tidak sudah tersampaikan oleh "0".
 */
export function remainingStock(stock: number | null, held: number): number | null {
  if (stock === null) return null;
  return Math.max(0, stock - held);
}

/** Apakah item ini masih boleh dibeli sebanyak `wanted`. */
export function hasStock(stock: number | null, held: number, wanted = 1): boolean {
  const sisa = remainingStock(stock, held);
  return sisa === null || sisa >= wanted;
}

/**
 * Berapa banyak jatah item ini yang sedang dipegang order berjalan.
 *
 * Satu query COUNT beríndeks per checkout. Untuk skala toko ini tidak terukur -
 * pertimbangan yang sama yang membuat kuota voucher dihitung dengan cara ini.
 */
export async function countHeldStock(
  productItemId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<number> {
  return client.order.count({ where: { productItemId, ...MASIH_MEMEGANG } });
}

/**
 * Gerbang stok untuk jalur checkout & API mitra.
 *
 * Mengembalikan pesan kalau HABIS, atau null kalau boleh lanjut. Item tanpa
 * batas stok (`stock === null`) keluar lebih awal TANPA menyentuh database sama
 * sekali - jadi seluruh produk otomatis yang tidak memakai fitur ini tidak
 * membayar satu query pun.
 */
export async function checkStockAvailable(item: { id: string; stock: number | null }): Promise<string | null> {
  if (item.stock === null) return null;
  const held = await countHeldStock(item.id);
  return hasStock(item.stock, held) ? null : OUT_OF_STOCK_MESSAGE;
}

/**
 * Sisa stok untuk BANYAK item sekaligus - dipakai panel admin & halaman produk.
 *
 * Satu groupBy, bukan N query: halaman produk dengan 20 nominal kalau tidak
 * akan menembak 20 COUNT berurutan hanya untuk menggambar satu daftar.
 */
export async function countHeldStockMany(productItemIds: string[]): Promise<Map<string, number>> {
  if (productItemIds.length === 0) return new Map();
  const rows = await db.order.groupBy({
    by: ["productItemId"],
    where: { productItemId: { in: productItemIds }, ...MASIH_MEMEGANG },
    _count: { _all: true },
  });
  return new Map(
    rows
      .filter((r): r is typeof r & { productItemId: string } => r.productItemId !== null)
      .map((r) => [r.productItemId, r._count._all]),
  );
}
