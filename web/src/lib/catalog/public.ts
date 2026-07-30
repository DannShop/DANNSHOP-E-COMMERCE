import { db } from "@/lib/db";
import type { ProviderKey, ProviderSkuStatus } from "@prisma/client";

export function isItemPurchasable(
  providerSkus: { provider: ProviderKey; status: ProviderSkuStatus }[],
  activeProviders: Set<ProviderKey>,
): boolean {
  return providerSkus.some(
    (s) => s.provider === "DIGIFLAZZ" && s.status === "ACTIVE" && activeProviders.has(s.provider),
  );
}

export async function getActiveCategories(): Promise<{ id: string; slug: string; name: string }[]> {
  return db.category.findMany({
    where: { products: { some: { isActive: true } } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, name: true },
  });
}

export interface ProductForCheckout {
  id: string;
  slug: string;
  name: string;
  publisher: string | null;
  banner: string | null;
  inputFields: { name: string; label: string }[];
  items: { id: string; name: string; sellingPrice: bigint; memberPrice: bigint; purchasable: boolean }[];
}

export async function getProductForCheckout(
  categorySlug: string,
  productSlug: string,
): Promise<ProductForCheckout | null> {
  const [product, activeProviderConfigs] = await Promise.all([
    db.product.findFirst({
      where: { slug: productSlug, isActive: true, category: { slug: categorySlug } },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          include: { providerSkus: { select: { provider: true, status: true } } },
        },
      },
    }),
    db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } }),
  ]);
  if (!product) return null;

  const activeProviders = new Set(activeProviderConfigs.map((p) => p.key));

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    publisher: product.publisher,
    banner: product.banner,
    inputFields: product.inputFields as { name: string; label: string }[],
    items: product.items.map((item) => ({
      id: item.id,
      name: item.name,
      sellingPrice: item.sellingPrice,
      memberPrice: item.memberPrice,
      purchasable: isItemPurchasable(item.providerSkus, activeProviders),
    })),
  };
}
