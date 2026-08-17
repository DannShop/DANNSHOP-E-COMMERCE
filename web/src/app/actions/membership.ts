"use server";

import { buildTierPriceTable, type TierPriceTableResult } from "@/lib/membership/tier-price-table";

export type ActionResult = { ok?: string; error?: string };

// purchaseTier() DIHAPUS (2026-08-17) bersama halaman /membership.
//
// Program membership berlangganan digantikan program reseller: paketnya sekali
// bayar seumur hidup dan dibayar lewat Midtrans, bukan dipotong dari saldo.
// Jalur barunya ada di lib/reseller/purchase.ts.
//
// Dihapus, bukan dibiarkan menganggur: fungsi ini diekspor dari berkas Server
// Action, dan Server Action yang diekspor adalah endpoint HTTP yang hidup -
// bisa dipanggil siapa pun walau tidak ada satu tombol pun yang menunjuk ke
// sana. Yang ini memotong saldo, jadi membiarkannya jauh lebih mahal daripada
// sekadar kode mati.

// ===== Katalog harga per tier - versi PUBLIK =====
//
// Dipakai halaman /membership supaya customer bisa lihat sendiri "kalau saya
// langganan Bronze, diamond ini jadi berapa" SEBELUM membayar, bukan cuma
// membaca angka persentase diskon di kartu tier.
//
// Sengaja TANPA requireAdmin: siapa pun, termasuk yang belum login, boleh
// memanggil ini. Datanya (nama produk/denominasi, harga jual, persentase
// diskon tier) semuanya sudah publik lewat halaman katalog dan kartu tier itu
// sendiri - tidak ada yang bocor di sini yang tidak bisa dilihat pengunjung
// dengan cara lain. Yang TIDAK pernah ikut keluar: harga modal provider.
//
// Beda dari previewTierPricing di actions/admin-membership.ts: yang publik ini
// HANYA menampilkan tier isActive (yang benar-benar bisa dibeli sekarang) -
// memajang harga tier yang belum tayang akan menjanjikan sesuatu yang belum
// tentu jadi kenyataan.
export async function getPublicTierPriceTable(
  formData: FormData,
): Promise<TierPriceTableResult & { error?: string }> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return { tiers: [], rows: [], error: "Pilih produk dulu." };

  const { tiers, rows } = await buildTierPriceTable({ productId }, { includeInactiveTiers: false });
  if (tiers.length === 0) return { tiers: [], rows: [], error: "Belum ada tier yang tersedia untuk dibandingkan." };
  return { tiers, rows };
}
