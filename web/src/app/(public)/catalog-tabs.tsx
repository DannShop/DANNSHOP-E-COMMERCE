"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchesProductQuery } from "@/lib/catalog/product-search";
import { ProductCard } from "./product-card";
import type { CatalogCategory } from "@/lib/catalog/public";

const GRID = "grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

export function CatalogTabs({ categories }: { categories: CatalogCategory[] }) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("kategori");
  const defaultCategory =
    categories.find((c) => c.slug === categoryParam) ??
    categories.find((c) => c.products.length > 0) ??
    categories[0];
  const [selectedSlug, setSelectedSlug] = useState(defaultCategory?.slug);
  const [query, setQuery] = useState("");
  const selected = categories.find((c) => c.slug === selectedSlug) ?? defaultCategory;

  // Seluruh katalog diratakan sekali, bukan tiap ketikan. Data ini memang sudah
  // ada di browser (dikirim getCatalogHomeData), jadi pencarian tidak perlu
  // menunggu jaringan sama sekali — dan itu yang membuatnya terasa seketika.
  const allProducts = useMemo(
    () => categories.flatMap((c) => c.products.map((p) => ({ product: p, category: c }))),
    [categories],
  );

  const searching = query.trim() !== "";
  const results = useMemo(() => {
    if (!searching) return [];
    return allProducts.filter(({ product, category }) =>
      matchesProductQuery(
        { name: product.name, publisher: product.publisher, categoryName: category.name },
        query,
      ),
    );
  }, [allProducts, query, searching]);

  if (!selected) {
    return <p className="text-muted-foreground">Katalog belum tersedia.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari produk — Mobile Legends, Telkomsel, Token PLN..."
          aria-label="Cari produk"
          className="h-10 pr-9 pl-9"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Hapus pencarian"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Saat mencari, tab kategori DISEMBUNYIKAN dan hasilnya datang dari
          seluruh kategori sekaligus. Menahan hasil di dalam tab yang sedang
          aktif akan membuat produk yang jelas-jelas ada terlihat tidak ada —
          persis kebingungan yang bikin pencarian ini ditambahkan. */}
      {searching ? (
        <div className="flex flex-col gap-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {results.length === 0
              ? `Tidak ada produk yang cocok dengan "${query.trim()}".`
              : `${results.length} produk ditemukan`}
          </p>

          {results.length > 0 && (
            <div className={GRID}>
              {results.map(({ product, category }) => (
                <div key={product.id} className="flex flex-col gap-1">
                  <ProductCard product={product} categorySlug={category.slug} />
                  {/* Nama kategori ikut ditampilkan karena hasilnya lintas
                      kategori — tanpa itu, dua produk bernama mirip dari
                      kategori berbeda tidak bisa dibedakan. */}
                  <span className="truncate px-1 text-[0.6875rem] text-muted-foreground">{category.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
            {categories.map((c) => (
              <Button
                key={c.id}
                variant={c.slug === selected.slug ? "default" : "outline"}
                size="sm"
                className="shrink-0 transition duration-200 ease-out hover:shadow-md hover:ring-2 hover:ring-primary"
                onClick={() => setSelectedSlug(c.slug)}
              >
                {c.name}
              </Button>
            ))}
          </div>

          {selected.products.length === 0 ? (
            <p className="text-muted-foreground">Segera hadir, nantikan produk kategori ini.</p>
          ) : (
            <div className={GRID}>
              {selected.products.map((p) => (
                <ProductCard key={p.id} product={p} categorySlug={selected.slug} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
