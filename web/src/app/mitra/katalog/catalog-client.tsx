"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";
import type { PartnerPriceProduct } from "@/lib/partner/price-list";

const SELECT_CLASS = "h-9 w-full rounded-md border bg-transparent px-3 text-sm sm:w-56";

function SkuCell({ sku }: { sku: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Salin SKU"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(sku);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex max-w-full items-center gap-1 rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:bg-foreground/[0.12]"
    >
      <span className="truncate">{sku}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-50" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * Katalog versi browser.
 *
 * Difilter di klien, bukan lewat request ke server per ketikan: seluruh katalog
 * sudah ikut terkirim bersama halaman (jumlahnya ratusan baris, bukan puluhan
 * ribu), jadi pencarian per huruf tanpa satu pun request tambahan justru jauh
 * lebih ringan daripada memanggil endpoint tiap ketikan.
 */
export function CatalogClient({ products, tier }: { products: PartnerPriceProduct[]; tier: string | null }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) map.set(p.category, p.category_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (category ? p.category === category : true))
      .map((p) => ({
        ...p,
        items: p.items.filter((item) => {
          if (onlyAvailable && !item.available) return false;
          if (!q) return true;
          // SKU ikut dicari: mitra yang sedang mendiagnosis rc 14 datang ke sini
          // membawa SKU dari lognya, bukan nama produknya.
          return (
            item.name.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            p.product_name.toLowerCase().includes(q) ||
            (p.publisher ?? "").toLowerCase().includes(q)
          );
        }),
      }))
      .filter((p) => p.items.length > 0);
  }, [products, query, category, onlyAvailable]);

  const totalItems = filtered.reduce((sum, p) => sum + p.items.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama produk, nominal, atau SKU..."
              className="h-9 pl-9"
              aria-label="Cari katalog"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {categories.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="size-3.5"
          />
          Hanya yang tersedia
        </label>

        <p className="text-xs text-muted-foreground">
          {totalItems} SKU ditampilkan · harga sudah termasuk diskon tier{" "}
          <strong className="text-foreground">{tier ?? "Free"}</strong> kamu
          {tier ? "" : " (tanpa tier, harganya sama dengan harga retail)"}.
        </p>
      </div>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Tidak ada SKU yang cocok dengan pencarian itu.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((product) => (
          <section key={product.product} className="glass-card overflow-hidden rounded-2xl">
            <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-border/60 px-4 py-3">
              <h2 className="font-heading text-sm font-bold">{product.product_name}</h2>
              <Badge variant="muted">{product.category_name}</Badge>
              {product.publisher && <span className="text-xs text-muted-foreground">{product.publisher}</span>}
              <span className="ml-auto text-[11px] text-muted-foreground">
                customer_no: <code className="rounded bg-foreground/10 px-1">{product.customer_no_format || "—"}</code>
              </span>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="bg-foreground/[0.03] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nominal</th>
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 text-right font-medium">Harga</th>
                    <th className="px-4 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {product.items.map((item) => (
                    <tr key={item.sku} className="border-t border-border/40">
                      <td className="px-4 py-2">{item.name}</td>
                      <td className="max-w-[12rem] px-4 py-2">
                        <SkuCell sku={item.sku} />
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatRupiah(item.price)}</td>
                      <td className="px-4 py-2 text-right">
                        {item.available ? (
                          <Badge variant="success">Tersedia</Badge>
                        ) : (
                          <Badge variant="muted">Kosong</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
