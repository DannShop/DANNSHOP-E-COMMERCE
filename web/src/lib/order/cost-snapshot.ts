import type { FulfillmentMode } from "@prisma/client";

// Satu-satunya aturan yang memutuskan modal sebuah order. MURNI: nol DB.
//
// ===== KENAPA MODALNYA DI-SNAPSHOT, BUKAN DIBACA ULANG =====
//
// `Order.costPrice` adalah salinan yang dibekukan, persis seperti
// `sellingPrice`/`productName` yang sudah lebih dulu di-snapshot di order.
// Membaca ulang modal dari produk saat menyusun laporan akan salah dengan cara
// yang tidak kelihatan: modal berubah tiap sync harga provider, jadi laporan
// bulan lalu akan ikut bergeser setiap kali harga hari ini berubah - dan
// angkanya tidak pernah cocok lagi dengan uang yang benar-benar keluar.
//
// ===== KENAPA DUA SUMBER, BUKAN SATU =====
//
// MANUAL: modalnya diketik admin di ProductItem.costPrice, jadi sudah diketahui
//         sejak checkout.
// AUTO:   modalnya milik ProviderSku, dan mana provider yang dipakai baru
//         pasti SETELAH pengiriman berhasil - failover bisa memindahkannya ke
//         provider lain dengan modal berbeda. Mengisinya saat checkout berarti
//         mencatat modal provider yang ternyata tidak pernah memproses apa pun.

/**
 * Modal yang dicatat SAAT ORDER DIBUAT.
 *
 * null untuk AUTO dengan sengaja - bukan "belum tahu, isi nanti nol", tapi
 * "diisi oleh jalur fulfillment saat pengiriman berhasil".
 */
export function initialOrderCostPrice(
  fulfillmentMode: FulfillmentMode,
  itemCostPrice: bigint | null,
): bigint | null {
  return fulfillmentMode === "MANUAL" ? itemCostPrice : null;
}

export interface ProfitBreakdown {
  /** Uang masuk dari order yang modalnya TERCATAT. */
  revenueWithCost: bigint;
  /** Modal dari order-order tersebut. */
  cost: bigint;
  /** revenueWithCost - cost. Bisa negatif, dan itu memang perlu terlihat. */
  profit: bigint;
  /** Uang masuk dari order yang modalnya TIDAK tercatat. */
  revenueWithoutCost: bigint;
  /** Jumlah order yang modalnya tidak tercatat. */
  ordersWithoutCost: number;
}

/**
 * Menghitung laba dari sekumpulan order, memisahkan yang modalnya tidak diketahui.
 *
 * Order tanpa modal TIDAK dianggap bermodal nol. Menganggapnya nol membuat
 * labanya terbaca 100% - angka yang terlihat sangat bagus dan sepenuhnya
 * bohong. Yang benar adalah mengeluarkannya dari perhitungan dan MENGATAKAN
 * berapa banyak yang dikeluarkan, supaya admin tahu seberapa jauh angka ini
 * bisa dipercaya.
 */
export function computeProfit(
  orders: { total: bigint; costPrice: bigint | null }[],
): ProfitBreakdown {
  let revenueWithCost = 0n;
  let cost = 0n;
  let revenueWithoutCost = 0n;
  let ordersWithoutCost = 0;

  for (const order of orders) {
    if (order.costPrice === null) {
      revenueWithoutCost += order.total;
      ordersWithoutCost += 1;
      continue;
    }
    revenueWithCost += order.total;
    cost += order.costPrice;
  }

  return {
    revenueWithCost,
    cost,
    profit: revenueWithCost - cost,
    revenueWithoutCost,
    ordersWithoutCost,
  };
}
