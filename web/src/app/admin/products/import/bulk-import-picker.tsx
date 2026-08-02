"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { slugifyBrand } from "@/lib/catalog/bulk-import";
import { ActionMessage, INITIAL_STATE, withPrevState } from "../action-utils";
import type { ServerAction } from "../action-utils";

const PROVIDER_OPTIONS: { key: string; label: string }[] = [
  { key: "DIGIFLAZZ", label: "Digiflazz" },
  { key: "OKECONNECT", label: "OkeConnect" },
  { key: "QIOSPAY", label: "QiosPay" },
  { key: "SERPUL", label: "Serpul" },
];

interface PriceListRow {
  skuCode: string;
  productName: string;
  brand: string;
  costPrice: string;
  available: boolean;
}

export function BulkImportPicker({
  categories,
  bulkImportProducts,
}: {
  categories: { id: string; name: string }[];
  bulkImportProducts: ServerAction;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [provider, setProvider] = useState(PROVIDER_OPTIONS[0].key);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [markupPercent, setMarkupPercent] = useState("10");
  const [memberMarkupPercent, setMemberMarkupPercent] = useState("5");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [slugByBrand, setSlugByBrand] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(withPrevState(bulkImportProducts), INITIAL_STATE);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFetchError(null);
      const params = new URLSearchParams({ provider, q: query });
      fetch(`/api/admin/provider-price-list?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Gagal mengambil price list.");
          setRows(Array.isArray(data.rows) ? data.rows : []);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setRows([]);
          setFetchError(e instanceof Error ? e.message : "Gagal mengambil price list.");
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [provider, query]);

  const groups = useMemo(() => {
    const byBrand = new Map<string, PriceListRow[]>();
    for (const row of rows) {
      const list = byBrand.get(row.brand) ?? [];
      list.push(row);
      byBrand.set(row.brand, list);
    }
    return Array.from(byBrand.entries());
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="import-category">Kategori tujuan</Label>
          <Select value={categoryId} onValueChange={(v) => v && setCategoryId(v)}>
            <SelectTrigger id="import-category" className="w-full">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-provider">Provider</Label>
          <Select value={provider} onValueChange={(v) => v && setProvider(v)}>
            <SelectTrigger id="import-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-markup">Markup harga jual (%)</Label>
          <Input
            id="import-markup"
            type="number"
            min={0}
            step="0.1"
            value={markupPercent}
            onChange={(e) => setMarkupPercent(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="import-member-markup">Markup harga member (%)</Label>
          <Input
            id="import-member-markup"
            type="number"
            min={0}
            step="0.1"
            value={memberMarkupPercent}
            onChange={(e) => setMemberMarkupPercent(e.target.value)}
          />
        </div>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari nama brand, mis. Mobile Legends, Free Fire, Telkomsel..."
        aria-label="Cari brand produk"
      />

      {loading && <p className="text-xs text-muted-foreground">Mencari...</p>}
      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
      {!loading && !fetchError && groups.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {query.trim()
            ? `Tidak ada hasil untuk "${query}". Coba kata kunci lain, atau sync harga dulu di halaman Providers.`
            : "Ketik nama brand untuk mencari produk yang sudah terdaftar di provider."}
        </p>
      )}

      {groups.map(([brand, brandRows]) => {
        const slug = slugByBrand[brand] ?? slugifyBrand(brand);
        const checkedCount = brandRows.filter((r) => selected[r.skuCode]).length;

        return (
          <form key={brand} action={formAction} className="space-y-3 rounded-lg border p-3">
            <input type="hidden" name="categoryId" value={categoryId} />
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="markupPercent" value={markupPercent} />
            <input type="hidden" name="memberMarkupPercent" value={memberMarkupPercent} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{brand}</p>
                <p className="text-xs text-muted-foreground">{brandRows.length} denominasi ditemukan</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`slug-${brand}`} className="text-xs text-muted-foreground">
                  Slug produk
                </Label>
                <Input
                  id={`slug-${brand}`}
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlugByBrand((prev) => ({ ...prev, [brand]: e.target.value }))}
                  className="h-8 w-48 font-mono text-xs"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Harga modal</TableHead>
                    <TableHead className="text-right">Est. jual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brandRows.map((row) => {
                    const markupNum = Number(markupPercent) || 0;
                    const estSell = Math.round(Number(row.costPrice) * (1 + markupNum / 100));
                    return (
                      <TableRow key={row.skuCode}>
                        <TableCell>
                          <Checkbox
                            name="skuCodes"
                            value={row.skuCode}
                            defaultChecked
                            disabled={!row.available}
                            onCheckedChange={(checked) =>
                              setSelected((prev) => ({ ...prev, [row.skuCode]: checked === true }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{row.productName}</div>
                          <div className="font-mono text-xs text-muted-foreground">{row.skuCode}</div>
                          {!row.available && (
                            <Badge variant="muted" className="mt-0.5">
                              Nonaktif di provider
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          Rp {Number(row.costPrice).toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          Rp {estSell.toLocaleString("id-ID")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Menambahkan..." : `Tambah ${checkedCount || brandRows.filter((r) => r.available).length} item terpilih`}
              </Button>
            </div>
          </form>
        );
      })}

      <ActionMessage state={state} />
    </div>
  );
}
