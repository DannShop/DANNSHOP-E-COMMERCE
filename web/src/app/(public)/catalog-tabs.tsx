"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProductCard } from "./product-card";
import type { CatalogCategory } from "@/lib/catalog/public";

// Pencarian produk SENGAJA tidak ada di sini — sudah ada di header storefront
// (components/search-overlay.tsx), yang berjalan server-side lewat /api/search
// dan tersedia di SEMUA halaman, bukan cuma beranda. Menaruh kotak cari kedua di
// halaman ini cuma membelah perhatian dan membuat dua hasil yang bisa berbeda.
export function CatalogTabs({ categories }: { categories: CatalogCategory[] }) {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("kategori");
  const defaultCategory =
    categories.find((c) => c.slug === categoryParam) ??
    categories.find((c) => c.products.length > 0) ??
    categories[0];
  const [selectedSlug, setSelectedSlug] = useState(defaultCategory?.slug);
  const selected = categories.find((c) => c.slug === selectedSlug) ?? defaultCategory;

  /**
   * Menyalakan tab SEKALIGUS menuliskannya ke URL.
   *
   * Sebelumnya tab cuma hidup di state React, jadi URL-nya tidak pernah berubah
   * dan me-refresh halaman selalu melempar orang kembali ke kategori pertama -
   * termasuk saat dia sedang menelusuri kategori lain. Sekarang kategorinya ikut
   * di alamat, jadi refresh, tombol kembali, dan tautan yang dibagikan
   * semuanya mendarat di kategori yang benar.
   *
   * Dipakai `history.replaceState`, BUKAN router.replace(): keduanya mengubah
   * alamat, tapi router.replace() menempuh perjalanan ke server untuk merender
   * ulang halaman yang datanya sudah ada di tangan kita - berpindah tab jadi
   * terasa berat tanpa satu pun informasi baru yang didapat. replaceState juga
   * TIDAK menumpuk riwayat, jadi tombol kembali membawa orang keluar dari
   * beranda seperti yang dia harapkan, bukan menyusuri ulang tab satu per satu.
   */
  function selectCategory(slug: string) {
    setSelectedSlug(slug);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("kategori", slug);
    window.history.replaceState(null, "", url);
  }

  if (!selected) {
    return <p className="text-muted-foreground">Katalog belum tersedia.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
        {categories.map((c) => (
          <Button
            key={c.id}
            variant={c.slug === selected.slug ? "default" : "outline"}
            size="sm"
            className="shrink-0 transition duration-200 ease-out hover:shadow-md hover:ring-2 hover:ring-primary"
            onClick={() => selectCategory(c.slug)}
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
