"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUploadField } from "@/components/admin/image-upload-field";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function PaymentMethodForm({
  method,
  action,
  uploadLogo,
}: {
  method: {
    id: string;
    code: string;
    label: string;
    logoUrl: string | null;
    feeFlat: string;
    feePercent: number;
    expiryMinutes: number;
    sortOrder: number;
    isActive: boolean;
  };
  action: (formData: FormData) => Promise<ActionResult>;
  uploadLogo: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [logoUrl, setLogoUrl] = useState(method.logoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const uploadFields = useMemo(() => ({ code: method.code }), [method.code]);

  return (
    <div className="rounded-lg border p-3 sm:p-4">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={method.id} />

        {/* Baris identitas. Kotak logo SELALU dirender (walau kosong) supaya tinggi
            dan titik awal kolom baris ini identik di semua kartu - itu yang bikin
            daftarnya terbaca rapi sebagai satu tabel, bukan kartu-kartu acak. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid h-9 w-14 shrink-0 place-items-center overflow-hidden rounded border bg-muted/50">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- URL arbitrer dari admin, tanpa domain whitelist */
              <img src={logoUrl} alt="" className="size-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
          <div className="min-w-[9rem] flex-1 space-y-1.5">
            {/* Kode metode dipakai sebagai label input namanya sekaligus - satu
                elemen, dua informasi, tanpa menambah tinggi baris. */}
            <Label htmlFor={`label-${method.id}`} className="text-xs text-muted-foreground">
              {method.code}
            </Label>
            <Input id={`label-${method.id}`} name="label" defaultValue={method.label} required />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isActive" defaultChecked={method.isActive} />
              Aktif
            </label>
            <Button type="submit" size="sm" disabled={pending || uploading}>
              {pending ? "..." : "Simpan"}
            </Button>
          </div>
        </div>

        {/* Empat angka selalu dalam grid kolom sama rata: 2 kolom di ponsel,
            4 kolom sejak tablet. Lebar kolom tidak lagi ditentukan panjang isi,
            jadi label terpanjang pun tidak mendorong kolom sebelahnya. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`feeFlat-${method.id}`} className="text-xs">Fee flat (Rp)</Label>
            <Input id={`feeFlat-${method.id}`} name="feeFlat" type="number" min={0} defaultValue={method.feeFlat} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`feePercent-${method.id}`} className="text-xs">Fee (basis point)</Label>
            <Input
              id={`feePercent-${method.id}`}
              name="feePercent"
              type="number"
              min={0}
              defaultValue={method.feePercent}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`expiryMinutes-${method.id}`} className="text-xs">Batas bayar (menit)</Label>
            {/* Minimum 15 bukan angka pilihan sendiri: scheduler expiry Midtrans
                hanya andal untuk durasi >= 15 menit. Di bawah itu transaksi bisa
                tetap hidup di Midtrans padahal di sistem kita sudah kadaluarsa. */}
            <Input
              id={`expiryMinutes-${method.id}`}
              name="expiryMinutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={method.expiryMinutes}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sortOrder-${method.id}`} className="text-xs">Urutan</Label>
            <Input id={`sortOrder-${method.id}`} name="sortOrder" type="number" defaultValue={method.sortOrder} />
          </div>
        </div>

        {/* Panel logo sengaja <details>, bukan render bersyarat: isinya tetap ada
            di DOM (jadi input logoUrl tetap ikut terkirim saat disimpan) tapi
            tidak dilayout/dilukis selama tertutup. Ini yang memangkas tinggi
            halaman - dan tinggi halaman itulah yang bikin scroll tersendat,
            karena blur 24px milik .glass-panel (sidebar & header) mahal di
            perangkat ber-RAM kecil, persis seperti dicatat di globals.css. */}
        <details className="group rounded-md border border-dashed">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors marker:content-none hover:text-foreground">
            <ChevronRight
              className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden="true"
            />
            Ubah logo
          </summary>
          <div className="space-y-1.5 border-t border-dashed px-3 py-3">
            <Label htmlFor={`logoUrl-${method.id}`} className="text-xs">Logo (URL manual)</Label>
            <Input
              id={`logoUrl-${method.id}`}
              name="logoUrl"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="/payment-logos/bca.svg"
            />
            <ImageUploadField
              id={`logoFile-${method.id}`}
              label="atau upload file"
              value={logoUrl}
              onChange={setLogoUrl}
              upload={uploadLogo}
              uploadFields={uploadFields}
              // Crop dengan rasio yang sama persis dengan kotak tampilnya (h-9
              // w-14 = 16:10), supaya admin bisa memangkas ruang kosong/elemen lain
              // di sekitar logo dari file sumber.
              //
              // Tetap TANPA maxDimension: dengan begitu processImage cuma memotong,
              // TIDAK mengecilkan (skala tetap 1:1), jadi resolusi asli logo utuh -
              // ketajaman di strip pembayaran tetap terjaga. Yang berubah cuma
              // encode ulang ke WebP, dan itu memang tak terhindarkan begitu gambar
              // dipotong. Logo SVG otomatis melewati dialog crop ini sepenuhnya
              // (isProcessableImage menolak SVG) sehingga tetap vektor & tajam
              // tanpa encode ulang sama sekali - jalur yang paling umum untuk logo bank.
              aspect={16 / 10}
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              helpText="Disarankan sekitar 256×160px (rasio 16:10, latar transparan). Ukuran asli dipertahankan (tidak dikecilkan) biar tetap tajam; SVG diunggah apa adanya tanpa crop. Maks 5MB."
              previewClassName="h-9 w-14 shrink-0 rounded border bg-muted/50"
              previewFit="contain"
              onUploadingChange={setUploading}
            />
          </div>
        </details>

        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </form>
    </div>
  );
}
