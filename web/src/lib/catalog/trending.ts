import { db } from "@/lib/db";

const TRENDING_LIMIT = 4;
const AUTO_WINDOW_DAYS = 7;

export interface TrendingProduct {
  id: string;
  slug: string;
  categorySlug: string;
  name: string;
  /** Ikon persegi produk; tampil di kotak 1:1 pada kartu trending. */
  iconUrl: string | null;
}

async function getManualTrending(excludeIds: string[] = [], take: number = TRENDING_LIMIT): Promise<TrendingProduct[]> {
  const products = await db.product.findMany({
    where: { isTrending: true, isActive: true, id: { notIn: excludeIds } },
    orderBy: { name: "asc" },
    take,
    select: { id: true, slug: true, name: true, iconUrl: true, category: { select: { slug: true } } },
  });
  return products.map((p) => ({ id: p.id, slug: p.slug, categorySlug: p.category.slug, name: p.name, iconUrl: p.iconUrl }));
}

async function getAutoTrending(): Promise<TrendingProduct[]> {
  const since = new Date(Date.now() - AUTO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await db.order.groupBy({
    by: ["productItemId"],
    where: { status: "COMPLETED", createdAt: { gte: since }, productItemId: { not: null } },
    _count: { productItemId: true },
  });
  if (grouped.length === 0) return [];

  const itemIds = grouped.map((g) => g.productItemId as string);
  const items = await db.productItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, productId: true, product: { select: { id: true, slug: true, name: true, iconUrl: true, isActive: true, category: { select: { slug: true } } } } },
  });
  const itemToProduct = new Map(items.map((i) => [i.id, i.product]));

  const countByProduct = new Map<string, { count: number; product: (typeof items)[number]["product"] }>();
  for (const g of grouped) {
    const product = itemToProduct.get(g.productItemId as string);
    if (!product || !product.isActive) continue;
    const existing = countByProduct.get(product.id);
    const count = g._count.productItemId;
    if (existing) existing.count += count;
    else countByProduct.set(product.id, { count, product });
  }

  return Array.from(countByProduct.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, TRENDING_LIMIT)
    .map(({ product }) => ({ id: product.id, slug: product.slug, categorySlug: product.category.slug, name: product.name, iconUrl: product.iconUrl }));
}

export async function getTrendingProducts(mode: "manual" | "auto"): Promise<TrendingProduct[]> {
  if (mode === "manual") return getManualTrending();

  const auto = await getAutoTrending();
  if (auto.length >= TRENDING_LIMIT) return auto;

  // Toko masih sepi (auto < 4) - isi sisanya dari produk manual supaya
  // section tidak pernah tampil setengah kosong.
  const fallback = await getManualTrending(
    auto.map((p) => p.id),
    TRENDING_LIMIT - auto.length,
  );
  return [...auto, ...fallback];
}
