"use client";

import { useActionState, useMemo, useState } from "react";
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
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-8 sm:items-end">
      <input type="hidden" name="id" value={method.id} />
      <div className="col-span-2 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">{method.code}</Label>
        <Input name="label" defaultValue={method.label} required />
      </div>
      <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-2">
        <div>
          <Label htmlFor={`logoUrl-${method.id}`} className="text-xs">Logo (URL manual)</Label>
          <Input
            id={`logoUrl-${method.id}`}
            name="logoUrl"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="/payment-logos/bca.svg"
          />
        </div>
        <ImageUploadField
          id={`logoFile-${method.id}`}
          label="atau upload file"
          value={logoUrl}
          onChange={setLogoUrl}
          upload={uploadLogo}
          uploadFields={uploadFields}
          // Crop dengan rasio yang sama persis dengan kotak tampilnya (h-10
          // w-16 = 16:10), supaya admin bisa memangkas ruang kosong/elemen lain
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
          previewClassName="h-10 w-16 rounded border bg-muted/50"
          previewFit="contain"
          onUploadingChange={setUploading}
        />
      </div>
      <div>
        <Label htmlFor={`feeFlat-${method.id}`} className="text-xs">Fee flat (Rp)</Label>
        <Input id={`feeFlat-${method.id}`} name="feeFlat" type="number" min={0} defaultValue={method.feeFlat} />
      </div>
      <div>
        <Label htmlFor={`feePercent-${method.id}`} className="text-xs">Fee (basis point)</Label>
        <Input id={`feePercent-${method.id}`} name="feePercent" type="number" min={0} defaultValue={method.feePercent} />
      </div>
      <div>
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
      <div>
        <Label htmlFor={`sortOrder-${method.id}`} className="text-xs">Urutan</Label>
        <Input id={`sortOrder-${method.id}`} name="sortOrder" type="number" defaultValue={method.sortOrder} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox name="isActive" defaultChecked={method.isActive} />
        <span className="text-sm">Aktif</span>
        <Button type="submit" size="sm" disabled={pending || uploading} className="ml-auto">
          {pending ? "..." : "Simpan"}
        </Button>
      </div>
      {(state.ok || state.error) && (
        <p className={`col-span-full text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
