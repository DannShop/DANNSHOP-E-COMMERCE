import { db } from "@/lib/db";
import { effectivePrice, isFlashActive } from "@/lib/pricing/effective-price";

// Sumber perhitungan TUNGGAL untuk "berapa yang dibayar customer per tier per
// item", dipakai DUA pemanggil dengan cakupan berbeda:
//   - preview admin (per KATEGORI, requireAdmin-gated) - actions/admin-membership.ts
//   - katalog harga publik (per PRODUK, terbuka) - actions/membership.ts
//
// Keduanya WAJIB lewat effectivePrice() - satu-satunya penentu harga final di
// codebase ini - supaya admin maupun customer melihat angka yang sama persis
// dengan yang ditagih saat checkout, bukan hitungan `harga - diskon` yang bisa
// melenceng dari lantai memberPrice atau flash sale yang sedang jalan.

export interface TierPriceTableTier {
  id: string;
  name: string;
  badgeColor: string;
  discountPercent: number;
}

// BigInt tidak bisa menyeberangi batas server action, jadi semua nominal
// dikirim sebagai string - pola yang sama dengan MarkupPreviewRowSerialized.
export interface TierPriceTableRow {
  itemId: string;
  productName: string;
  itemName: string;
  basePrice: string;
  memberFloor: string;
  flashActive: boolean;
  /** Sejajar indeksnya dengan `tiers` pada hasil yang sama. */
  tierPrices: string[];
}

export interface TierPriceTableResult {
  tiers: TierPriceTableTier[];
  rows: TierPriceTableRow[];
}

/**
 * `scope` menentukan item mana yang masuk tabel - tepat satu yang diisi:
 *   - `productId`: semua denominasi satu produk (katalog harga publik)
 *   - `categoryId`: semua item dalam kategori, dibatasi CATEGORY_ITEM_LIMIT
 *   - keduanya kosong: semua item aktif, dibatasi CATEGORY_ITEM_LIMIT
 *
 * Batas hanya berlaku untuk cakupan kategori/semua. Cakupan per-produk sengaja
 * TANPA batas: satu produk paling banter punya beberapa puluh denominasi, dan
 * memotongnya di tengah justru menyembunyikan nominal yang mungkin persis
 * dicari customer.
 */
const CATEGORY_ITEM_LIMIT = 150;

export async function buildTierPriceTable(
  scope: { productId?: string; categoryId?: string },
  { includeInactiveTiers }: { includeInactiveTiers: boolean },
): Promise<TierPriceTableResult> {
  const byProduct = Boolean(scope.productId);

  const [tiers, items] = await Promise.all([
    db.membershipTier.findMany({
      where: includeInactiveTiers ? {} : { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, badgeColor: true, discountPercent: true },
    }),
    db.productItem.findMany({
      where: {
        isActive: true,
        ...(byProduct
          ? { productId: scope.productId, product: { isActive: true } }
          : { product: { isActive: true, ...(scope.categoryId ? { categoryId: scope.categoryId } : {}) } }),
      },
      include: { product: { select: { name: true } } },
      // Per produk diurutkan sesuai urutan tampil yang diatur admin (sortOrder),
      // supaya susunan denominasinya sama dengan yang dilihat customer di
      // halaman produk - bukan diurut ulang per abjad dan jadi terasa acak.
      orderBy: byProduct
        ? [{ sortOrder: "asc" }, { name: "asc" }]
        : [{ product: { name: "asc" } }, { sortOrder: "asc" }],
      ...(byProduct ? {} : { take: CATEGORY_ITEM_LIMIT }),
    }),
  ]);

  // Satu `now` untuk seluruh tabel, bukan Date baru per baris - kalau tidak,
  // item yang flash sale-nya persis berakhir di tengah perhitungan bisa
  // tampil tidak konsisten antar kolom di baris yang sama.
  const now = new Date();

  const rows: TierPriceTableRow[] = items.map((item) => ({
    itemId: item.id,
    productName: item.product.name,
    itemName: item.name,
    basePrice: effectivePrice(item, { discountBp: 0, now }).toString(),
    memberFloor: item.memberPrice.toString(),
    flashActive: isFlashActive(item, now),
    tierPrices: tiers.map((t) => effectivePrice(item, { discountBp: t.discountPercent, now }).toString()),
  }));

  return { tiers, rows };
}
