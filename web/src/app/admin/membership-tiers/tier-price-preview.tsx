"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import type { TierPricePreviewResult } from "@/app/actions/admin-membership";

// Menampilkan berapa yang BENAR-BENAR dibayar customer di tiap tier, bukan
// sekadar persentase diskonnya. Angkanya datang dari effectivePrice() di
// server (lihat previewTierPricing) supaya lantai memberPrice dan flash sale
// ikut terhitung persis seperti saat checkout.
export function TierPricePreview({
  categories,
  previewAction,
}: {
  categories: { id: string; name: string }[];
  previewAction: (formData: FormData) => Promise<TierPricePreviewResult>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [result, setResult] = useState<TierPricePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePreview() {
    setLoading(true);
    const fd = new FormData();
    fd.set("categoryId", categoryId);
    setResult(await previewAction(fd));
    setLoading(false);
  }

  const tiers = result?.tiers ?? [];
  const rows = result?.rows ?? [];
  const anyFlash = rows.some((r) => r.flashActive);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="tier-preview-category" className="text-xs">Kategori</Label>
          <select
            id="tier-preview-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setResult(null);
            }}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" onClick={handlePreview} disabled={loading}>
          {loading ? "Menghitung..." : "Tampilkan Harga"}
        </Button>
      </div>

      {result?.error && <p className="text-sm text-destructive">{result.error}</p>}

      {result?.rows && (
        rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Tidak ada item aktif di kategori ini.
          </p>
        ) : (
          <>
            <div className="max-h-[32rem] overflow-auto rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="tabular-nums">Tanpa Tier</TableHead>
                    {tiers.map((t) => (
                      <TableHead key={t.id} className="tabular-nums">
                        <span className="flex flex-col gap-0.5">
                          <span
                            className="w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ backgroundColor: t.badgeColor }}
                          >
                            {t.name}
                          </span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {(t.discountPercent / 100).toFixed(2)}%
                          </span>
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.itemId}>
                      <TableCell className="whitespace-normal">
                        <span className="flex items-center gap-1.5">
                          {row.productName} · {row.itemName}
                          {row.flashActive && (
                            <Zap
                              className="size-3.5 shrink-0 text-amber-500"
                              aria-label="Flash sale sedang aktif"
                            />
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Lantai harga modal {formatRupiah(BigInt(row.memberFloor))}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {formatRupiah(BigInt(row.basePrice))}
                      </TableCell>
                      {row.tierPrices.map((price, i) => {
                        const hemat = BigInt(row.basePrice) - BigInt(price);
                        return (
                          <TableCell key={tiers[i]?.id ?? i} className="tabular-nums text-xs">
                            <span className="font-medium">{formatRupiah(BigInt(price))}</span>
                            {hemat > 0n && (
                              <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
                                hemat {formatRupiah(hemat)}
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Harga yang tampil di sini sama persis dengan yang ditagih saat checkout - dihitung
                lewat jalur harga yang sama, bukan perkiraan.
              </p>
              <p>
                Diskon tier tidak pernah menembus <strong>harga modal</strong> tiap item. Kalau
                dua tier menampilkan angka yang sama, artinya keduanya sudah menyentuh lantai itu dan
                menaikkan diskon lagi tidak akan mengubah apa pun.
              </p>
              {anyFlash && (
                <p className="flex items-start gap-1.5">
                  <Zap className="mt-0.5 size-3 shrink-0 text-amber-500" aria-hidden="true" />
                  <span>
                    Item bertanda petir sedang flash sale. Selama flash berjalan, harganya mengalahkan
                    semua diskon tier - itu sebabnya semua kolomnya menunjukkan angka yang sama.
                  </span>
                </p>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
