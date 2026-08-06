"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MarkupPreviewRowSerialized } from "@/app/actions/catalog";

type ActionResult = { ok?: string; error?: string };
type PreviewResult = { rows?: MarkupPreviewRowSerialized[]; error?: string };

function formatRupiah(v: string): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(v));
}

export function MarkupForm({
  categories,
  previewAction,
  applyAction,
}: {
  categories: { id: string; name: string }[];
  previewAction: (formData: FormData) => Promise<PreviewResult>;
  applyAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [sellingMarkupPercent, setSellingMarkupPercent] = useState("");
  const [memberMarkupPercent, setMemberMarkupPercent] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ActionResult | null>(null);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("categoryId", categoryId);
    fd.set("sellingMarkupPercent", sellingMarkupPercent);
    fd.set("memberMarkupPercent", memberMarkupPercent);
    return fd;
  }

  async function handlePreview() {
    setPreviewing(true);
    setApplyResult(null);
    const result = await previewAction(buildFormData());
    setPreview(result);
    setPreviewing(false);
  }

  async function handleApply() {
    setApplying(true);
    const result = await applyAction(buildFormData());
    setApplyResult(result);
    setApplying(false);
    if (result.ok) setPreview(null);
  }

  const rows = preview?.rows ?? [];
  const applicableCount = rows.filter((r) => !r.skipped).length;
  const skippedCount = rows.length - applicableCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="markup-category">Kategori</Label>
          <select
            id="markup-category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPreview(null);
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
        <div className="space-y-1.5">
          <Label htmlFor="markup-selling">Markup Harga Jual (%)</Label>
          <Input
            id="markup-selling"
            inputMode="decimal"
            value={sellingMarkupPercent}
            onChange={(e) => {
              setSellingMarkupPercent(e.target.value);
              setPreview(null);
            }}
            placeholder="15"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="markup-member">Markup Harga Member (%)</Label>
          <Input
            id="markup-member"
            inputMode="decimal"
            value={memberMarkupPercent}
            onChange={(e) => {
              setMemberMarkupPercent(e.target.value);
              setPreview(null);
            }}
            placeholder="12"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Dihitung dari harga modal provider (bukan dari harga jual sekarang) — hasilnya sama seperti bulk-import,
        jadi menjalankan ini dua kali dengan angka sama tidak akan menumpuk kenaikan.
      </p>

      <Button
        type="button"
        variant="outline"
        onClick={handlePreview}
        disabled={previewing || !sellingMarkupPercent || !memberMarkupPercent}
        className="self-start"
      >
        {previewing ? "Menghitung..." : "Preview Perubahan"}
      </Button>

      {preview?.error && <p className="text-sm text-danger-foreground">{preview.error}</p>}

      {preview?.rows && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {applicableCount} item akan diperbarui
              {skippedCount > 0 && `, ${skippedCount} item dilewati`}
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tidak ada item yang cocok (kategori kosong, atau semua item belum punya SKU provider).
            </p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-lg ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="tabular-nums">Harga Jual</TableHead>
                    <TableHead className="tabular-nums">Harga Member</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.itemId} className={r.skipped ? "opacity-60" : ""}>
                      <TableCell className="whitespace-normal">
                        {r.productName} · {r.itemName}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {formatRupiah(r.oldSellingPrice)} <span className="text-muted-foreground">→</span>{" "}
                        <span className="font-medium">{formatRupiah(r.newSellingPrice)}</span>
                      </TableCell>
                      <TableCell className="tabular-nums text-xs">
                        {formatRupiah(r.oldMemberPrice)} <span className="text-muted-foreground">→</span>{" "}
                        <span className="font-medium">{formatRupiah(r.newMemberPrice)}</span>
                      </TableCell>
                      <TableCell>
                        {r.skipped ? (
                          <Badge variant="warning" title={r.skipReason}>
                            Dilewati
                          </Badge>
                        ) : (
                          <Badge variant="success">Diterapkan</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {applicableCount > 0 && (
            <div className="flex items-center gap-3">
              <Button type="button" onClick={handleApply} disabled={applying} variant="destructive">
                {applying ? "Menerapkan..." : `Terapkan ke ${applicableCount} Item`}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPreview(null)} disabled={applying}>
                Batal
              </Button>
            </div>
          )}
        </div>
      )}

      {applyResult?.ok && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {applyResult.ok}
        </p>
      )}
      {applyResult?.error && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          {applyResult.error}
        </p>
      )}
    </div>
  );
}
