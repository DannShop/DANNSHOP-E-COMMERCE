import { Suspense } from "react";
import { getCatalogHomeData } from "@/lib/catalog/public";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings";
import { CatalogTabs } from "./catalog-tabs";
import { BannerCarousel } from "@/components/banner-carousel";
import { TrendingSection } from "@/components/trending-section";
import { getTrendingProducts } from "@/lib/catalog/trending";
import { StorefrontSlot } from "@/components/storefront-slot";

// Dinamis (bukan statis/ISR) supaya "mulai dari Rp X" di kartu katalog
// selalu akurat terhadap jadwal flash sale (mulai/berakhir per item) tanpa
// bergantung ke revalidatePath yang bisa lupa dipanggil dari titik lain.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, banners, settings] = await Promise.all([
    getCatalogHomeData(),
    db.banner.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getSiteSettings(),
  ]);
  const trending = await getTrendingProducts(settings.trendingMode);

  return (
    <div className="flex flex-col gap-6">
      <StorefrontSlot name="home_top" />
      {banners.length > 0 && (
        <BannerCarousel
          banners={banners.map((b) => ({
            id: b.id,
            imageUrl: b.imageUrl,
            imageUrlDesktop: b.imageUrlDesktop,
            linkUrl: b.linkUrl,
          }))}
        />
      )}
      {trending.length > 0 && <TrendingSection products={trending} />}
      <Suspense>
        <CatalogTabs categories={categories} />
      </Suspense>
      <StorefrontSlot name="home_bottom" />
    </div>
  );
}
