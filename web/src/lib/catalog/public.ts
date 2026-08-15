import { db } from "@/lib/db";
import type { FulfillmentMode, ProviderKey, ProviderSkuStatus } from "@prisma/client";
import { getActiveProviders } from "@/lib/providers/registry";
import { effectivePrice, isFlashActive, type PricedItem } from "@/lib/pricing/effective-price";
import { getIdCheckConfig } from "@/lib/catalog/id-check";

// Ketersediaan produk MANUAL tidak ditentukan provider mana pun - barangnya
// dikirim admin sendiri, jadi tidak pernah ada ProviderSku yang bisa dicek.
// `fulfillmentMode` wajib ikut dipertimbangkan di SEMUA titik yang menilai
// "item ini bisa dibeli atau tidak": kalau tidak, produk manual tampil abu-abu
// di katalog dan ditolak saat checkout, keduanya tanpa sebab yang terlihat.
//
// PROVIDER-AGNOSTIC, dan itu WAJIB sejalan dengan selectFulfillmentSku di
// lib/order/select-provider.ts. Keduanya menjawab pertanyaan yang sama - "item ini
// bisa dikirim atau tidak" - cuma di dua waktu berbeda: yang ini saat katalog
// digambar, yang itu saat order benar-benar dikirim.
//
// Fungsi ini SEMPAT memakai `s.provider === "DIGIFLAZZ"` secara harfiah, sisa dari
// masa ketika Digiflazz satu-satunya provider. Saat OkeConnect masuk, hardcode di
// selectFulfillmentSku dicabut tapi yang di sini tertinggal - dan bentuk
// kegagalannya paling menyesatkan yang mungkin: item yang dipetakan HANYA ke
// OkeConnect lolos semua pengecekan admin (SKU ACTIVE, provider aktif, harga
// benar, produk aktif), tetap tampil di daftar katalog, lalu halaman produknya
// berkata "sedang tidak tersedia untuk dibeli saat ini". Tidak ada satu pun
// layar admin yang menunjuk sebabnya, karena dari sisi data memang tidak ada
// yang salah.
//
// Jadi kalau menambah gerbang ketersediaan baru: samakan dengan select-provider.ts,
// jangan menyebut nama provider mana pun.
//
// Satu perbedaan yang DISENGAJA dari selectFulfillmentSku: guard anti-jual-rugi
// (costPrice <= sellingPrice) tidak dijalankan di sini. Fungsi ini cuma menerima
// provider + status, dan menyembunyikan item dari katalog karena harga modalnya
// naik akan membuat produk hilang diam-diam dari toko. Biar checkout yang menolak
// dengan sebab yang jelas.
export function isItemPurchasable(
  providerSkus: { provider: ProviderKey; status: ProviderSkuStatus }[],
  activeProviders: Set<ProviderKey>,
  fulfillmentMode: FulfillmentMode = "AUTO",
): boolean {
  if (fulfillmentMode === "MANUAL") return true;
  return providerSkus.some((s) => s.status === "ACTIVE" && activeProviders.has(s.provider));
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  publisher: string | null;
  iconUrl: string | null;
  banner: string | null;
  startingPrice: bigint;
}

export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  products: CatalogProduct[];
}

export async function getCatalogHomeData(): Promise<CatalogCategory[]> {
  const now = new Date();
  const categories = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      products: {
        where: { isActive: true, items: { some: { isActive: true } } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          publisher: true,
          iconUrl: true,
          banner: true,
          items: {
            where: { isActive: true },
            select: { sellingPrice: true, memberPrice: true, flashPrice: true, flashStartAt: true, flashEndAt: true },
          },
        },
      },
    },
  });

  // "Mulai dari Rp X" ikut harga flash kalau sedang aktif, tapi tidak ikut
  // diskon tier (kartu katalog belum tentu tahu tier viewer) - selalu
  // tampilkan harga yang berlaku untuk pengunjung tanpa tier, biar tidak
  // pernah menjanjikan angka yang lebih murah dari yang sebenarnya ditagih.
  const startingPriceOf = (items: PricedItem[]) =>
    items.reduce((min, i) => {
      const price = effectivePrice(i, { discountBp: 0, now });
      return price < min ? price : min;
    }, effectivePrice(items[0], { discountBp: 0, now }));

  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    products: c.products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      publisher: p.publisher,
      iconUrl: p.iconUrl,
      banner: p.banner,
      startingPrice: startingPriceOf(p.items),
    })),
  }));
}

// Daftar produk untuk PICKER katalog harga member (/membership). Sengaja tidak
// memuat items sama sekali - harga per denominasi baru diambil lewat server
// action setelah customer memilih satu produk, supaya payload halaman tidak
// ikut membengkak seiring bertambahnya katalog. Bandingkan dengan
// getCatalogHomeData() di atas yang memang perlu items untuk menghitung
// "mulai dari Rp X" tiap kartu.
export interface TierCatalogProduct {
  id: string;
  name: string;
  publisher: string | null;
  iconUrl: string | null;
  categoryId: string;
}

export interface TierCatalogCategory {
  id: string;
  name: string;
}

export async function getTierCatalogProducts(): Promise<{
  products: TierCatalogProduct[];
  categories: TierCatalogCategory[];
}> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, items: { some: { isActive: true } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, publisher: true, iconUrl: true, categoryId: true },
    }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  // Kategori yang tidak punya satu pun produk tayang dibuang di sini, bukan di
  // client - chip filter yang selalu menghasilkan daftar kosong cuma bikin
  // customer mengira katalognya rusak.
  const usedCategoryIds = new Set(products.map((p) => p.categoryId));
  return { products, categories: categories.filter((c) => usedCategoryIds.has(c.id)) };
}

export interface ProductSearchResult {
  id: string;
  slug: string;
  categorySlug: string;
  name: string;
  publisher: string | null;
}

export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Dipecah per KATA, bukan dicocokkan sebagai satu potongan utuh.
  //
  // Sebelumnya `name: { contains: q }` menuntut kata kuncinya muncul persis
  // berurutan. Itu cukup selama nama produk pendek ("Free Fire"), tapi katalog
  // sekarang memuat nama panjang hasil impor OkeConnect seperti "Indosat Cetak
  // Voucher Freedom Mini" — dan di situ orang mengetik potongan yang diingat
  // dengan urutan bebas ("indosat freedom"), yang tidak akan pernah ketemu.
  //
  // Semua kata harus cocok (AND), tapi tiap kata boleh cocok di nama, penerbit,
  // ATAU nama kategori. Dengan OR di antar-kata, mengetik lebih panjang justru
  // memperburuk hasil — makin banyak kata, makin banyak yang lolos.
  const terms = q.split(/\s+/).filter(Boolean);

  const products = await db.product.findMany({
    where: {
      isActive: true,
      items: { some: { isActive: true } },
      AND: terms.map((term) => ({
        OR: [
          { name: { contains: term } },
          { publisher: { contains: term } },
          { category: { name: { contains: term } } },
        ],
      })),
    },
    select: { id: true, slug: true, name: true, publisher: true, category: { select: { slug: true } } },
    take: 20,
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    categorySlug: p.category.slug,
    name: p.name,
    publisher: p.publisher,
  }));
}

export interface ProductForCheckout {
  id: string;
  slug: string;
  name: string;
  publisher: string | null;
  iconUrl: string | null;
  banner: string | null;
  inputFields: { name: string; label: string }[];
  fulfillmentMode: FulfillmentMode;
  /** Sudah memperhitungkan saklar induk - klien tidak perlu tahu dua sumbernya. */
  idCheckEnabled: boolean;
  items: {
    id: string;
    name: string;
    sellingPrice: bigint; // harga dasar - dipakai buat tampilan "harga dicoret" saat efektif != dasar
    effectivePrice: bigint; // harga yang beneran akan ditagih untuk viewer ini - pakai ini di semua kalkulasi/tampilan utama
    isFlashActive: boolean;
    groupName: string | null;
    groupSortOrder: number | null; // null bareng groupName - dipakai urutkan SECTION grup sesuai urutan admin, item di dalamnya tetap urut harga
    purchasable: boolean;
  }[];
}

// discountBp dipakai buat resolve harga efektif per item (lihat
// lib/pricing/effective-price.ts) - caller wajib sudah tahu diskon tier
// viewer (lib/membership/tier.ts) sebelum manggil ini, supaya harga yang
// dikirim ke client sudah final, bukan raw sellingPrice/memberPrice yang bisa
// salah dibaca titik lain (persis bug yang pernah terjadi di checkout.ts).
export async function getProductForCheckout(
  categorySlug: string,
  productSlug: string,
  discountBp: number,
): Promise<ProductForCheckout | null> {
  const now = new Date();
  const [product, activeProviders, idCheck] = await Promise.all([
    db.product.findFirst({
      where: { slug: productSlug, isActive: true, category: { slug: categorySlug } },
      include: {
        items: {
          where: { isActive: true },
          include: {
            providerSkus: { select: { provider: true, status: true } },
            group: { select: { name: true, sortOrder: true } },
          },
        },
      },
    }),
    getActiveProviders(),
    getIdCheckConfig(),
  ]);
  if (!product) return null;
  const idCheckOn = idCheck.enabled && idCheck.urlTemplate !== "";

  // Termurah (harga efektif yang beneran dibayar) duluan; sortOrder cuma
  // pemecah seri kalau ada dua nominal dengan harga efektif sama persis.
  const sortedItems = [...product.items].sort((a, b) => {
    const priceA = effectivePrice(a, { discountBp, now });
    const priceB = effectivePrice(b, { discountBp, now });
    if (priceA !== priceB) return priceA < priceB ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  const items = sortedItems.map((item) => ({
    id: item.id,
    name: item.name,
    sellingPrice: item.sellingPrice,
    effectivePrice: effectivePrice(item, { discountBp, now }),
    isFlashActive: isFlashActive(item, now),
    groupName: item.group?.name ?? null,
    groupSortOrder: item.group?.sortOrder ?? null,
    purchasable: isItemPurchasable(item.providerSkus, activeProviders, product.fulfillmentMode),
  }));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    publisher: product.publisher,
    iconUrl: product.iconUrl,
    banner: product.banner,
    inputFields: product.inputFields as { name: string; label: string }[],
    // Dikirim ke klien supaya halaman produk bisa memberi tahu pembeli bahwa
    // produk ini dikirim manual SEBELUM dia membayar - bukan baru ketahuan
    // saat invoice tidak kunjung berubah jadi "Berhasil".
    fulfillmentMode: product.fulfillmentMode,
    idCheckEnabled: product.idCheckEnabled && idCheckOn,
    items,
  };
}
