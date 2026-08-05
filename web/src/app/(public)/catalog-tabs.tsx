"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import type { CatalogCategory } from "@/lib/catalog/public";

export function CatalogTabs({ categories }: { categories: CatalogCategory[] }) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("kategori");
  const defaultCategory =
    categories.find((c) => c.slug === categoryParam) ??
    categories.find((c) => c.products.length > 0) ??
    categories[0];
  const [selectedSlug, setSelectedSlug] = useState(defaultCategory?.slug);
  const selected = categories.find((c) => c.slug === selectedSlug) ?? defaultCategory;

  if (!selected) {
    return <p className="text-muted-foreground">Katalog belum tersedia.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <Button
            key={c.id}
            variant={c.slug === selected.slug ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            onClick={() => setSelectedSlug(c.slug)}
          >
            {c.name}
          </Button>
        ))}
      </div>

      {selected.products.length === 0 ? (
        <p className="text-muted-foreground">Segera hadir, nantikan produk kategori ini.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {selected.products.map((p) => (
            <ProductCard key={p.id} product={p} categorySlug={selected.slug} />
          ))}
        </div>
      )}
    </div>
  );
}
