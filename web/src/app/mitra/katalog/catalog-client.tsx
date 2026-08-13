"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import type { PartnerPriceProduct } from "@/lib/partner/price-list";

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
 * Penyaji katalog untuk satu halaman hasil.
 *
 * Pencarian, filter kategori, dan paginasi SUDAH dikerjakan server (lihat
 * page.tsx) — komponen ini sengaja tidak menyentuhnya lagi. Satu-satunya filter
 * yang tersisa di sini adalah "sembunyikan yang kosong", dan itu memang HARUS
 * di klien: `available` bukan kolom database, melainkan hasil hitungan
 * selectFulfillmentSku() atas harga modal & status provider saat itu. Tidak ada
 * cara memfilternya lewat query tanpa menarik seluruh katalog — persis hal yang
 * sedang kita hindari.
 *
 * Karena itu labelnya menyebut "di halaman ini" secara eksplisit: filter yang
 * diam-diam cuma berlaku sebagian jauh lebih menyesatkan daripada filter yang
 * jujur tentang cakupannya.
 */
export function CatalogClient({ products }: { products: PartnerPriceProduct[] }) {
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const shown = useMemo(() => {
    if (!onlyAvailable) return products;
    return products
      .map((p) => ({ ...p, items: p.items.filter((i) => i.available) }))
      .filter((p) => p.items.length > 0);
  }, [products, onlyAvailable]);

  const hiddenCount = products.length - shown.length;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={onlyAvailable}
          onChange={(e) => setOnlyAvailable(e.target.checked)}
          className="size-3.5"
        />
        Sembunyikan yang kosong <span className="opacity-70">(hanya di halaman ini)</span>
        {onlyAvailable && hiddenCount > 0 && (
          <span className="opacity-70">— {hiddenCount} produk disembunyikan</span>
        )}
      </label>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Semua produk di halaman ini sedang kosong. Coba halaman berikutnya atau hilangkan centangnya.
        </p>
      ) : (
        shown.map((product) => (
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
        ))
      )}
    </div>
  );
}
