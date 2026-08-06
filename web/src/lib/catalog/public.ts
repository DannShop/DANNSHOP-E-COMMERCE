import { db } from "@/lib/db";
import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";
import { getActiveProviders } from "@/lib/providers/registry";
import { effectivePrice, isFlashActive, type PricedItem } from "@/lib/pricing/effective-price";

export function isItemPurchasable(
  providerSkus: { provider: ProviderKey; status: ProviderSkuStatus }[],
  activeProviders: Set<ProviderKey>,
): boolean {
  return providerSkus.some(
    (s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE" && activeProviders.has(s.provider),
  );
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
  // harga member (kartu katalog belum tentu tahu status login viewer) -
  // selalu tampilkan harga yang berlaku untuk pengunjung belum login, biar
  // tidak pernah menjanjikan angka yang lebih murah dari yang sebenarnya
  // ditagih ke tamu.
  const startingPriceOf = (items: PricedItem[]) =>
    items.reduce((min, i) => {
      const price = effectivePrice(i, { isMember: false, now });
      return price < min ? price : min;
    }, effectivePrice(items[0], { isMember: false, now }));

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
  const products = await db.product.findMany({
    where: {
      isActive: true,
      items: { some: { isActive: true } },
      name: { contains: q },
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

// isMember dipakai buat resolve harga efektif per item (lihat
// lib/pricing/effective-price.ts) - caller wajib sudah tahu status login
// viewer sebelum manggil ini, supaya harga yang dikirim ke client sudah
// final, bukan raw sellingPrice/memberPrice yang bisa salah dibaca titik
// lain (persis bug yang pernah terjadi di checkout.ts).
export async function getProductForCheckout(
  categorySlug: string,
  productSlug: string,
  isMember: boolean,
): Promise<ProductForCheckout | null> {
  const now = new Date();
  const [product, activeProviders] = await Promise.all([
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
  ]);
  if (!product) return null;

  // Termurah (harga efektif yang beneran dibayar) duluan; sortOrder cuma
  // pemecah seri kalau ada dua nominal dengan harga efektif sama persis.
  const sortedItems = [...product.items].sort((a, b) => {
    const priceA = effectivePrice(a, { isMember, now });
    const priceB = effectivePrice(b, { isMember, now });
    if (priceA !== priceB) return priceA < priceB ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
  const items = sortedItems.map((item) => ({
    id: item.id,
    name: item.name,
    sellingPrice: item.sellingPrice,
    effectivePrice: effectivePrice(item, { isMember, now }),
    isFlashActive: isFlashActive(item, now),
    groupName: item.group?.name ?? null,
    groupSortOrder: item.group?.sortOrder ?? null,
    purchasable: isItemPurchasable(item.providerSkus, activeProviders),
  }));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    publisher: product.publisher,
    iconUrl: product.iconUrl,
    banner: product.banner,
    inputFields: product.inputFields as { name: string; label: string }[],
    items,
  };
}
