"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { MAX_DIMENSION } from "@/lib/image-processing";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";

export interface ProductFormCategory {
  id: string;
  name: string;
}

export interface ProductFormInitial {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  publisher: string | null;
  iconUrl: string | null;
  banner: string | null;
  description: string | null;
  inputFields: unknown;
  nicknameCheckKey: string | null;
  idCheckEnabled: boolean;
  fulfillmentMode: "AUTO" | "MANUAL";
  isTrending: boolean;
  partnerVisible: boolean;
}

export function ProductForm({
  action,
  categories,
  initial,
  submitLabel,
  uploadProductBanner,
}: {
  action: ServerAction;
  categories: ProductFormCategory[];
  initial?: ProductFormInitial;
  submitLabel: string;
  uploadProductBanner: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(withPrevState(action), INITIAL_STATE);
  const inputFieldsDefault = initial ? JSON.stringify(initial.inputFields ?? [], null, 2) : "";

  const [iconUrl, setIconUrl] = useState(initial?.iconUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(initial?.banner ?? "");
  const [iconUploading, setIconUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const uploading = iconUploading || bannerUploading;

  // Di-memo supaya identitas objeknya stabil — ImageUploadField memakainya
  // sebagai dependency, objek baru tiap render bikin callback-nya ikut berubah.
  const productId = initial?.id;
  const iconFields = useMemo(
    () => ({ kind: "icon", ...(productId ? { productId } : {}) }),
    [productId],
  );
  const bannerFields = useMemo(
    () => ({ kind: "banner", ...(productId ? { productId } : {}) }),
    [productId],
  );

  return (
    <form action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Kategori</Label>
          <Select
            name="categoryId"
            defaultValue={initial?.categoryId}
            items={categories.map((c) => ({ value: c.id, label: c.name }))}
            required
          >
            <SelectTrigger id="categoryId" className="w-full">
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
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            required
            defaultValue={initial?.slug}
            placeholder="mobile-legends"
            pattern="[a-z0-9\-]+"
            title="Huruf kecil, angka, tanda hubung"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Nama produk</Label>
          <Input id="name" name="name" required defaultValue={initial?.name} placeholder="Mobile Legends" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="publisher">Publisher (opsional)</Label>
          <Input id="publisher" name="publisher" defaultValue={initial?.publisher ?? ""} placeholder="Moonton" />
        </div>

        <div className="sm:col-span-2">
          <input type="hidden" name="iconUrl" value={iconUrl} />
          <ImageUploadField
            id="iconFile"
            label="Ikon produk — persegi (opsional)"
            value={iconUrl}
            onChange={setIconUrl}
            upload={uploadProductBanner}
            uploadFields={iconFields}
            aspect={1}
            maxDimension={MAX_DIMENSION.productIcon}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            helpText="Dipakai di kartu katalog, section Trending, dan ikon halaman produk. Disarankan 512×512px, persegi (1:1). Kosongkan untuk pakai gradien default."
            previewClassName="size-14 rounded-md"
            onUploadingChange={setIconUploading}
          />
        </div>

        <div className="sm:col-span-2">
          <input type="hidden" name="banner" value={bannerUrl} />
          <ImageUploadField
            id="bannerFile"
            label="Banner lebar halaman produk (opsional)"
            value={bannerUrl}
            onChange={setBannerUrl}
            upload={uploadProductBanner}
            uploadFields={bannerFields}
            aspect={21 / 9}
            maxDimension={MAX_DIMENSION.productBanner}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            helpText="Gambar lebar di bagian atas halaman produk. Disarankan 1280×549px (rasio 21:9). Kosongkan kalau tidak perlu."
            previewClassName="h-14 w-32 rounded-md"
            onUploadingChange={setBannerUploading}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Deskripsi (opsional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description ?? ""}
          placeholder="Deskripsi singkat produk untuk halaman member."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inputFields">Input fields (JSON array)</Label>
        <Textarea
          id="inputFields"
          name="inputFields"
          required
          defaultValue={inputFieldsDefault}
          className="font-mono text-xs"
          rows={4}
          placeholder={'[{"name":"user_id","label":"User ID"},{"name":"zone_id","label":"Zone ID"}]'}
        />
        <p className="text-xs text-muted-foreground">
          Daftar field yang diminta ke pembeli, contoh: {'[{"name":"user_id","label":"User ID"}]'}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="nicknameCheckKey">Kode game (cek ID)</Label>
          <Input
            id="nicknameCheckKey"
            name="nicknameCheckKey"
            defaultValue={initial?.nicknameCheckKey ?? ""}
            placeholder="mobile-legends"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Mengisi placeholder <code className="font-mono">{"{game}"}</code> pada URL penyedia. Nilainya mengikuti
            penyedia yang kamu pakai — lihat Admin → Cek ID Game.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="idCheckEnabled" name="idCheckEnabled" defaultChecked={initial?.idCheckEnabled ?? false} className="mt-0.5" />
          <Label htmlFor="idCheckEnabled" className="font-normal">
            Aktifkan cek ID untuk produk ini
            <span className="block text-xs text-muted-foreground">
              Tetap tidak muncul kalau saklar induk di halaman Cek ID Game masih mati.
            </span>
          </Label>
        </div>
      </div>

      <div className="space-y-1.5 rounded-lg border p-3">
        <Label htmlFor="fulfillmentMode">Mode pengiriman</Label>
        <Select name="fulfillmentMode" defaultValue={initial?.fulfillmentMode ?? "AUTO"}>
          <SelectTrigger id="fulfillmentMode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AUTO">Otomatis — dikirim provider (Digiflazz dll)</SelectItem>
            <SelectItem value="MANUAL">Manual — dikirim admin sendiri (App Premium dsb)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          <strong>Manual</strong>: pembeli tetap membayar lewat jalur normal, tapi pesanannya tidak diteruskan ke
          provider — berhenti di status &quot;Diproses&quot; sampai kamu menandainya selesai. Pembeli mendapat tombol
          konfirmasi WhatsApp/Telegram di halaman invoice, dan kamu dapat notifikasi Telegram. Produk manual tidak
          perlu punya SKU provider sama sekali.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="isTrending" name="isTrending" defaultChecked={initial?.isTrending ?? false} />
        <Label htmlFor="isTrending" className="font-normal">
          Trending (tampil di section 🔥 Trending kalau mode manual)
        </Label>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {/* Default true untuk produk baru — sama dengan default kolomnya, jadi
              perilaku katalog mitra tidak berubah diam-diam saat admin membuat
              produk tanpa menyentuh centang ini. */}
          <Checkbox id="partnerVisible" name="partnerVisible" defaultChecked={initial?.partnerVisible ?? true} />
          <Label htmlFor="partnerVisible" className="font-normal">
            Boleh dijual ke mitra H2H lewat API
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Terpisah dari status Aktif. Matikan kalau produk ini eksklusif storefront atau marginnya terlalu tipis untuk
          dijual reseller — produk tetap tayang di toko, tapi hilang dari{" "}
          <code className="rounded bg-foreground/10 px-1">/api/v1/price-list</code> dan transaksinya ditolak. Produk
          mode MANUAL tidak pernah muncul di katalog mitra apa pun centangnya.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || uploading}>
          {pending ? "Menyimpan..." : submitLabel}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
