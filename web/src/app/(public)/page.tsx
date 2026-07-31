import { getCatalogHomeData } from "@/lib/catalog/public";
import { CatalogTabs } from "./catalog-tabs";

export default async function HomePage() {
  const categories = await getCatalogHomeData();

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl bg-muted p-8">
        <h1 className="text-3xl font-bold">Topup Game & PPOB Otomatis</h1>
        <p className="mt-2 text-muted-foreground">
          Isi ulang diamond, pulsa, dan voucher favoritmu dengan cepat dan aman.
        </p>
      </section>
      <CatalogTabs categories={categories} />
    </div>
  );
}
