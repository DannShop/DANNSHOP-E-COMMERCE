"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { MAX_DIMENSION } from "@/lib/image-processing";
import type { InvoiceBranding, PaperSize } from "@/lib/invoice/branding";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

const PAPERS: { value: PaperSize; label: string }[] = [
  { value: "58", label: "58 mm (termal kecil)" },
  { value: "80", label: "80 mm (termal kasir)" },
  { value: "a4", label: "A4 / PDF" },
];

export function BrandingForm({
  initial,
  action,
  uploadLogo,
}: {
  initial: InvoiceBranding;
  action: (formData: FormData) => Promise<ActionResult>;
  uploadLogo: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [accent, setAccent] = useState(initial.accentColor);
  const [uploading, setUploading] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="logoUrl" value={logoUrl} />

      <ImageUploadField
        id="invoice-logo"
        label="Logo dokumen"
        value={logoUrl}
        onChange={setLogoUrl}
        upload={uploadLogo}
        aspect={40 / 12}
        maxDimension={MAX_DIMENSION.siteLogo}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        helpText="Tampil di header email, struk A4, dan invoice. Kosongkan untuk memakai logo situs. Video tidak didukung — klien email dan printer termal tidak bisa merendernya."
        previewClassName="h-12 w-40 rounded-md border bg-muted/40"
        previewFit="contain"
        onUploadingChange={setUploading}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="brandName">Nama brand</Label>
          <Input id="brandName" name="brandName" defaultValue={initial.brandName} maxLength={60} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accentColor">Warna aksen</Label>
          <div className="flex items-center gap-2">
            <input
              id="accentColor"
              name="accentColor"
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border bg-transparent p-1"
            />
            <Input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-32 font-mono"
              aria-label="Kode warna aksen"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tagline">Tagline</Label>
        <Input id="tagline" name="tagline" defaultValue={initial.tagline} maxLength={120} />
        <p className="text-xs text-muted-foreground">Satu baris di bawah nama brand pada header email & struk.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="supportLine">Kontak yang dicetak</Label>
          <Textarea id="supportLine" name="supportLine" defaultValue={initial.supportLine} rows={3} maxLength={400} />
          <p className="text-xs text-muted-foreground">Satu kontak per baris. Kosongkan untuk memakai kontak CS.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="addressLine">Alamat / info usaha</Label>
          <Textarea id="addressLine" name="addressLine" defaultValue={initial.addressLine} rows={3} maxLength={400} />
          <p className="text-xs text-muted-foreground">Opsional. Satu baris per baris teks.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="footerText">Kalimat penutup</Label>
        <Textarea id="footerText" name="footerText" defaultValue={initial.footerText} rows={2} maxLength={400} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="defaultPaperSize">Ukuran struk default</Label>
          <select
            id="defaultPaperSize"
            name="defaultPaperSize"
            defaultValue={initial.defaultPaperSize}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          >
            {PAPERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Ukuran yang terpilih duluan saat halaman struk dibuka — pembeli tetap bisa menggantinya.
          </p>
        </div>
        <label className="flex items-start gap-2 self-end pb-2 text-sm">
          <Checkbox name="showQrOnReceipt" defaultChecked={initial.showQrOnReceipt} className="mt-0.5" />
          <span>
            Cetak QR link invoice di struk
            <span className="block text-xs text-muted-foreground">
              Pembeli bisa memindai untuk mengecek status pesanannya sendiri.
            </span>
          </span>
        </label>
      </div>

      <Button type="submit" disabled={pending || uploading} className="self-start">
        {pending ? "Menyimpan..." : "Simpan Identitas Dokumen"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
