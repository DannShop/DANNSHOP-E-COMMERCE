// Kapan sebuah kegagalan provider BOLEH dicoba ulang ke provider lain.
//
// Ini titik paling rawan uang di seluruh fitur multi-provider. Failover yang
// terlalu berani menghasilkan kerugian yang tidak bisa ditarik balik: kalau
// provider pertama sebenarnya SUDAH mengirim barang tapi membalas "gagal"
// (timeout setelah diproses, callback nyasar, pesan tak dikenal), mengirim ulang
// ke provider kedua berarti pelanggan menerima dua kali sementara kita membayar
// dua kali.
//
// Karena itu aturannya dibalik dari kebiasaan "retry kalau gagal": failover hanya
// dijalankan untuk kegagalan yang bisa DIPASTIKAN terjadi SEBELUM provider
// menyentuh produk. Sisanya diperlakukan seperti sebelumnya (refund / antrean
// admin) — lebih baik satu order tertunda dan ditangani manusia daripada satu
// order terkirim dua kali secara diam-diam.

import type { FailureCategory } from "./failure-reason";

/**
 * Kategori yang aman di-failover, dan alasan tiap-tiapnya:
 *
 *  - `ip_not_whitelisted` — request ditolak di gerbang, tidak pernah masuk sistem
 *    transaksi provider sama sekali.
 *  - `insufficient_balance` — saldo kita di provider itu kurang, jadi transaksi
 *    ditolak sebelum diproses. Saldo di provider lain tidak ada hubungannya.
 *  - `product_issue` — SKU-nya yang bermasalah/kosong di provider itu, dan justru
 *    inilah kasus yang paling pantas dialihkan ke provider lain.
 *
 * Yang SENGAJA TIDAK masuk daftar:
 *  - `invalid_target` — nomor/ID tujuannya yang salah. Provider lain pasti menolak
 *    juga; mengulanginya cuma menambah panggilan gagal, bukan menyelamatkan order.
 *  - `duplicate` — provider menganggap refID sudah pernah dipakai. Ini justru
 *    pertanda transaksi sebelumnya mungkin BERHASIL. Failover di sini adalah cara
 *    tercepat mengirim dobel.
 *  - `unknown` — kita tidak tahu apa yang terjadi. Tepat karena tidak tahu, kita
 *    tidak boleh menganggapnya "belum terkirim".
 */
export const FAILOVER_SAFE_CATEGORIES: readonly FailureCategory[] = [
  "ip_not_whitelisted",
  "insufficient_balance",
  "product_issue",
] as const;

/**
 * Batas jumlah percobaan pengiriman per order.
 *
 * Bukan sekadar penjaga infinite loop (daftar provider sudah terbatas dan yang
 * sudah dicoba selalu dikecualikan). Ini juga pagar terakhir kalau suatu saat
 * ada provider ketiga/keempat: tiap percobaan tambahan adalah satu peluang lagi
 * untuk pengiriman ganda, dan tidak ada order yang layak menanggung risiko itu
 * lebih dari dua kali.
 */
export const MAX_FULFILLMENT_ATTEMPTS = 2;

export type FailoverDecision =
  | { failover: true }
  | { failover: false; reason: "category_not_safe" | "attempts_exhausted" };

export function decideFailover(params: {
  category: FailureCategory;
  /** Jumlah percobaan pengiriman yang SUDAH dilakukan untuk order ini. */
  attemptsSoFar: number;
  maxAttempts?: number;
}): FailoverDecision {
  const max = params.maxAttempts ?? MAX_FULFILLMENT_ATTEMPTS;
  if (!FAILOVER_SAFE_CATEGORIES.includes(params.category)) {
    return { failover: false, reason: "category_not_safe" };
  }
  if (params.attemptsSoFar >= max) {
    return { failover: false, reason: "attempts_exhausted" };
  }
  return { failover: true };
}
