"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Search, TriangleAlert } from "lucide-react";
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
import { normalizeBrandName } from "@/lib/catalog/brand-name";
import type { CatalogSource } from "@/lib/providers/labels";
import { ActionMessage, INITIAL_STATE, withPrevState } from "../action-utils";
import type { ServerAction } from "../action-utils";

interface PriceListRow {
  skuCode: string;
  productName: string;
  brand: string;
  costPrice: string;
  available: boolean;
}

export function BulkImportPicker({
  categories,
  sources,
  initialProvider,
  bulkImportProducts,
}: {
  categories: { id: string; name: string }[];
  sources: CatalogSource[];
  initialProvider: string;
  bulkImportProducts: ServerAction;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [provider, setProvider] = useState(initialProvider);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [brandsShown, setBrandsShown] = useState(0);
  const [brandsTotal, setBrandsTotal] = useState(0);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [markupPercent, setMarkupPercent] = useState("10");
  const [memberMarkupPercent, setMemberMarkupPercent] = useState("5");
  // Kunci = skuCode. Hanya yang bernilai true yang ikut terkirim — lihat catatan
  // "opt-in" di bawah.
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [slugByBrand, setSlugByBrand] = useState<Record<string, string>>({});
  const [nameByBrand, setNameByBrand] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(withPrevState(bulkImportProducts), INITIAL_STATE);

  // Mengganti provider atau kata kunci SELALU membuang centangan yang ada.
  //
  // Bukan kerapian — ini mencegah impor siluman. Centangan disimpan per skuCode
  // di state, jadi tanpa pembersihan ini SKU yang dicentang di pencarian
  // sebelumnya tetap hidup walau barisnya sudah tidak ada di layar, dan ikut
  // terkirim saat submit. Admin akan membuat item dari SKU yang tidak pernah dia
  // lihat. Dikerjakan di handler, bukan di useEffect: mengubah state sebagai
  // reaksi atas state lain memicu render bertingkat yang tidak perlu.
  function changeProvider(next: string) {
    setProvider(next);
    setSelected({});
  }
  function changeQuery(next: string) {
    setQuery(next);
    setSelected({});
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFetchError(null);
      const params = new URLSearchParams({ provider, q: query, groupByBrand: "1" });
      fetch(`/api/admin/provider-price-list?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Gagal mengambil price list.");
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setBrandsShown(data.brandsShown ?? 0);
          setBrandsTotal(data.brandsTotal ?? 0);
          setSyncedAt(data.syncedAt ?? null);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setRows([]);
          setBrandsShown(0);
          setBrandsTotal(0);
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

  const truncated = brandsTotal > brandsShown;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="import-provider">Provider</Label>
          <Select value={provider} onValueChange={(v) => v && changeProvider(v)}>
            <SelectTrigger id="import-provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          <Label htmlFor="import-member-markup">Markup harga modal (%)</Label>
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

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder="Cari brand, mis. Telkomsel, Three, Mobile Legends..."
          aria-label="Cari brand produk"
          className="pl-9"
        />
      </div>

      {loading && <p className="text-xs text-muted-foreground">Mencari...</p>}
      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

      {/* Pemotongan diberitahukan, bukan disembunyikan. Sebelumnya daftar dipotong
          di baris ke-50 tanpa satu pun tanda — pada OkeConnect (471 brand) itu
          berarti admin rutin melihat sebagian kecil dan mengira itu semuanya. */}
      {!loading && !fetchError && truncated && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Menampilkan <strong>{brandsShown}</strong> dari <strong>{brandsTotal}</strong> brand yang cocok. Persempit
            kata kuncinya untuk melihat sisanya — brand yang tampil selalu lengkap denominasinya.
          </span>
        </p>
      )}

      {!loading && !fetchError && groups.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          {syncedAt === null
            ? 'Provider ini belum pernah di-sync — klik "Sync Harga Sekarang" di halaman Providers dulu.'
            : query.trim()
              ? `Tidak ada brand yang cocok dengan "${query}". Coba kata kunci lain.`
              : "Ketik nama brand untuk mencari produk yang tersedia di provider ini."}
        </p>
      )}

      {groups.map(([brand, brandRows]) => {
        // Slug tetap diturunkan dari nama BRAND asli, bukan dari nama tampilan:
        // slug ikut menentukan URL produk, dan membuatnya berubah tiap kali admin
        // mengetik ulang judulnya akan memutus tautan yang sudah tersebar.
        const slug = slugByBrand[brand] ?? slugifyBrand(brand);
        const displayName = nameByBrand[brand] ?? normalizeBrandName(brand);
        const selectable = brandRows.filter((r) => r.available);
        const checkedCount = brandRows.filter((r) => selected[r.skuCode]).length;
        const allChecked = selectable.length > 0 && selectable.every((r) => selected[r.skuCode]);

        return (
          <form key={brand} action={formAction} className="space-y-3 rounded-xl ring-1 ring-foreground/10 p-3">
            <input type="hidden" name="categoryId" value={categoryId} />
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="brand" value={brand} />
            <input type="hidden" name="markupPercent" value={markupPercent} />
            <input type="hidden" name="memberMarkupPercent" value={memberMarkupPercent} />

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {brandRows.length} denominasi
                {selectable.length !== brandRows.length && ` (${selectable.length} bisa dipilih)`} · dari{" "}
                <span className="font-mono">{brand}</span>
              </p>
              {/* Nama TAMPILAN, bisa diedit sebelum ditambahkan.
                  Terisi otomatis dengan versi rapi dari nama brand provider —
                  price list OkeConnect memuat nama seperti "TPG Diamond Mobile
                  Legends" dan "Isat Cetak Vcr Freedom", dan nama itu langsung
                  jadi judul yang dilihat pembeli. Sarannya otomatis, keputusannya
                  tetap di tangan admin: 471 nama tidak mungkin dibereskan
                  sempurna oleh aturan mana pun. */}
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <Label htmlFor={`name-${brand}`} className="text-xs text-muted-foreground">
                    Nama produk (dilihat pembeli)
                  </Label>
                  <Input
                    id={`name-${brand}`}
                    name="name"
                    value={displayName}
                    onChange={(e) => setNameByBrand((prev) => ({ ...prev, [brand]: e.target.value }))}
                    className="h-8 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`slug-${brand}`} className="text-xs text-muted-foreground">
                    Slug
                  </Label>
                  <Input
                    id={`slug-${brand}`}
                    name="slug"
                    value={slug}
                    onChange={(e) => setSlugByBrand((prev) => ({ ...prev, [brand]: e.target.value }))}
                    className="h-8 w-full font-mono text-xs sm:w-48"
                  />
                </div>
              </div>
            </div>

            <label className="flex w-fit items-center gap-2 text-xs font-medium">
              <Checkbox
                checked={allChecked}
                onCheckedChange={(checked) =>
                  setSelected((prev) => {
                    const next = { ...prev };
                    for (const r of selectable) next[r.skuCode] = checked === true;
                    return next;
                  })
                }
              />
              Pilih semua ({selectable.length})
            </label>

            <div className="no-scrollbar max-h-64 overflow-y-auto rounded-md ring-1 ring-foreground/10">
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
                          {/* OPT-IN, bukan opt-out. Sebelumnya semua baris
                              `defaultChecked` — sekali submit, seluruh brand
                              masuk kecuali yang sempat dicabut satu per satu.
                              Untuk brand berisi 114 denominasi itu berarti
                              mencabut 100-an centang hanya untuk mengambil
                              belasan; wajar kalau terasa "semua ikut masuk". */}
                          <Checkbox
                            name="skuCodes"
                            value={row.skuCode}
                            checked={selected[row.skuCode] === true}
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
              {/* Mati saat nol: tombol yang bisa ditekan tapi tidak melakukan
                  apa-apa lebih membingungkan daripada tombol yang jelas mati. */}
              <Button type="submit" size="sm" disabled={pending || checkedCount === 0}>
                {pending
                  ? "Menambahkan..."
                  : checkedCount === 0
                    ? "Pilih item dulu"
                    : `Tambah ${checkedCount} item ke katalog`}
              </Button>
            </div>
          </form>
        );
      })}

      <ActionMessage state={state} />
    </div>
  );
}
