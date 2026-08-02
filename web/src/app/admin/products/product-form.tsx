"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  banner: string | null;
  description: string | null;
  inputFields: unknown;
  nicknameCheckKey: string | null;
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

  const [bannerUrl, setBannerUrl] = useState(initial?.banner ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset supaya bisa pilih file yang sama lagi kalau mau ganti ulang
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (initial?.id) fd.set("productId", initial.id);
      const result = await uploadProductBanner(fd);
      if (result.error) {
        setUploadError(result.error);
      } else if (result.url) {
        setBannerUrl(result.url);
      }
    } catch {
      setUploadError("Gagal upload file, coba lagi.");
    } finally {
      setUploading(false);
    }
  }

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

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="bannerFile">Banner/logo produk (opsional)</Label>
          <input type="hidden" name="banner" value={bannerUrl} />
          <div className="flex items-center gap-3">
            {bannerUrl && (
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/10">
                <Image src={bannerUrl} alt="Preview banner" fill sizes="56px" className="object-cover" unoptimized />
              </div>
            )}
            <div className="flex-1 space-y-1">
              <Input
                id="bannerFile"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFileChange}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground">
                {uploading
                  ? "Mengupload..."
                  : "Ditampilkan sebagai gambar kartu produk. Kosongkan untuk pakai warna gradien default. Maks 5MB."}
              </p>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            </div>
            {bannerUrl && !uploading && (
              <Button type="button" variant="outline" size="xs" onClick={() => setBannerUrl("")}>
                Hapus
              </Button>
            )}
          </div>
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

      <div className="space-y-1.5">
        <Label htmlFor="nicknameCheckKey">Nickname check key (opsional)</Label>
        <Input
          id="nicknameCheckKey"
          name="nicknameCheckKey"
          defaultValue={initial?.nicknameCheckKey ?? ""}
          placeholder="Kunci field untuk cek nickname otomatis, jika didukung provider"
        />
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
