"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ActionMessage, INITIAL_STATE, withPrevState } from "../action-utils";
import type { ServerAction } from "../action-utils";

// Label provider — daftar tetap, sinkron dengan enum ProviderKey (prisma/schema.prisma).
// Duplikasi kecil (4 entri) dari admin/providers/provider-card.tsx sengaja tidak
// diekstrak ke modul bersama untuk menghindari coupling lintas fitur untuk hal sekecil ini.
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
  costPrice: string; // sudah di-string-kan di route (BigInt tidak bisa JSON.stringify)
  available: boolean;
}

export function SkuPicker({
  productItemId,
  mapProviderSku,
}: {
  productItemId: string;
  mapProviderSku: ServerAction;
}) {
  const [provider, setProvider] = useState(PROVIDER_OPTIONS[0].key);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mapState, mapAction, mapPending] = useActionState(withPrevState(mapProviderSku), INITIAL_STATE);

  // Debounced fetch ke route /api/admin/provider-price-list saat provider atau
  // kata kunci berubah (autocomplete: tampilkan hasil selagi mengetik, bukan
  // menunggu submit — lihat ux-guidelines "Autocomplete").
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
          setSyncedAt(data.syncedAt ?? null);
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

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">Cari &amp; petakan SKU provider</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={provider} onValueChange={(value) => value && setProvider(value)}>
          <SelectTrigger className="sm:w-40" aria-label="Pilih provider">
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
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama produk, brand, atau kode SKU..."
          aria-label="Cari SKU provider"
          className="flex-1"
        />
      </div>

      {loading && <p className="text-xs text-muted-foreground">Mencari...</p>}
      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
      {!loading && !fetchError && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {syncedAt === null
            ? "Belum pernah sync harga untuk provider ini — klik \"Sync Harga\" di halaman Providers dulu."
            : query.trim()
              ? `Tidak ada hasil untuk "${query}". Coba kata kunci lain.`
              : "Ketik nama produk, brand, atau kode SKU untuk mencari."}
        </p>
      )}

      {rows.length > 0 && (
        <div className="no-scrollbar max-h-72 overflow-y-auto rounded-md ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Kode SKU</TableHead>
                <TableHead className="text-right">Harga modal</TableHead>
                <TableHead className="justify-self-end text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.skuCode}>
                  <TableCell>
                    <div className="font-medium">{row.productName}</div>
                    <div className="text-xs text-muted-foreground">{row.brand}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.skuCode}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    Rp {Number(row.costPrice).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={mapAction} className="inline-flex items-center gap-2">
                      <input type="hidden" name="productItemId" value={productItemId} />
                      <input type="hidden" name="provider" value={provider} />
                      <input type="hidden" name="providerSkuCode" value={row.skuCode} />
                      <input type="hidden" name="costPrice" value={row.costPrice} />
                      {!row.available && <Badge variant="muted">Nonaktif</Badge>}
                      <Button type="submit" size="xs" variant="outline" disabled={mapPending || !row.available}>
                        {mapPending ? "Memetakan..." : "Pilih"}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ActionMessage state={mapState} />
    </div>
  );
}
