import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Berapa kali sebuah voucher SEDANG terpakai.
//
// ===== KENAPA DITURUNKAN, BUKAN DIHITUNG DENGAN COUNTER =====
//
// Rancangan yang jelas: kolom `usedCount` pada Voucher, dinaikkan saat dipakai,
// diturunkan lagi saat ordernya gagal. Rancangan itu ditolak dengan sengaja.
//
// Status order berpindah ke keadaan gagal di ENAM tempat yang berbeda:
//   1. lib/jobs/runner.ts        - job auto-expire
//   2. lib/payment/settlement.ts - webhook menyatakan expired
//   3. lib/payment/settlement.ts - webhook menyatakan gagal
//   4. lib/order/fulfillment.ts  - auto-refund ke saldo
//   5. lib/order/fulfillment.ts  - refund diulang manual oleh admin
//   6. app/actions/orders.ts     - refund manual admin
// ditambah dua jalur gagal di checkout itu sendiri (charge Midtrans gagal,
// saldo tidak cukup).
//
// Counter menuntut KEDELAPANNYA ingat memanggil pelepasan, selamanya, termasuk
// oleh orang yang menambahkan jalur kesembilan besok tanpa pernah membaca
// catatan ini. Dan yang lupa TIDAK menimbulkan error apa pun - cuma kuota yang
// menyusut diam-diam sampai kodenya berhenti bisa dipakai tanpa sebab yang
// terlihat, jenis kegagalan yang paling mahal dilacak.
//
// Dengan menurunkannya dari status order, tidak ada yang perlu diingat siapa
// pun: order yang gagal berhenti dihitung dengan sendirinya, di semua delapan
// jalur sekaligus, termasuk jalur yang belum ditulis.
//
// Ongkosnya satu query COUNT beríndeks per percobaan pemakaian voucher. Untuk
// skala toko ini, itu tidak terukur.

/**
 * Status yang berarti "uangnya tidak jadi masuk".
 *
 * Order dengan status ini melepas jatah vouchernya. NEEDS_REVIEW dan
 * REFUND_PENDING SENGAJA TIDAK ada di sini: keduanya berarti uangnya sudah
 * masuk dan perkaranya masih ditangani admin - melepas kuotanya sekarang
 * berarti kuota yang sama bisa dipakai orang lain sementara pesanan aslinya
 * masih mungkin diselesaikan.
 */
export const VOUCHER_RELEASING_STATUSES: OrderStatus[] = ["FAILED", "EXPIRED", "REFUNDED"];

/** Order yang masih menahan jatah voucher. */
const MASIH_TERPAKAI: Prisma.OrderWhereInput = {
  status: { notIn: VOUCHER_RELEASING_STATUSES },
};

export interface VoucherUsage {
  total: number;
  byTarget: number;
}

/**
 * Menghitung pemakaian voucher: total, dan oleh satu nomor tujuan.
 *
 * Keduanya diambil sekaligus supaya checkout cuma menunggu satu putaran, bukan
 * dua yang berurutan.
 */
export async function countVoucherUsage(
  voucherId: string,
  targetKey: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<VoucherUsage> {
  const [total, byTarget] = await Promise.all([
    client.voucherRedemption.count({ where: { voucherId, order: MASIH_TERPAKAI } }),
    client.voucherRedemption.count({ where: { voucherId, targetKey, order: MASIH_TERPAKAI } }),
  ]);
  return { total, byTarget };
}

/** Pemakaian total saja - untuk daftar voucher di panel admin. */
export async function countVoucherUsageTotals(
  voucherIds: string[],
): Promise<Map<string, number>> {
  if (voucherIds.length === 0) return new Map();
  const rows = await db.voucherRedemption.groupBy({
    by: ["voucherId"],
    where: { voucherId: { in: voucherIds }, order: MASIH_TERPAKAI },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.voucherId, r._count._all]));
}
