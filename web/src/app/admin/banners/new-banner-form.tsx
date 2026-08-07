"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { MAX_DIMENSION } from "@/lib/image-processing";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function NewBannerForm({
  action,
  uploadBannerImage,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  uploadBannerImage: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrlDesktop, setImageUrlDesktop] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingDesktop, setUploadingDesktop] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="imageUrl" value={imageUrl} />
      <input type="hidden" name="imageUrlDesktop" value={imageUrlDesktop} />

      <ImageUploadField
        id="new-banner-file"
        label="Gambar Banner — HP (wajib)"
        value={imageUrl}
        onChange={setImageUrl}
        upload={uploadBannerImage}
        aspect={21 / 9}
        maxDimension={MAX_DIMENSION.heroBanner}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        helpText="Disarankan 1920×823px (rasio 21:9). Tampil UTUH tanpa terpotong di HP."
        previewClassName="aspect-21/9 w-40 rounded-md"
        onUploadingChange={setUploading}
      />

      <ImageUploadField
        id="new-banner-file-desktop"
        label="Gambar Banner — Desktop (opsional)"
        value={imageUrlDesktop}
        onChange={setImageUrlDesktop}
        upload={uploadBannerImage}
        // 32:9, rasio yang benar-benar dipakai carousel di layar >=640px.
        // Dengan gambar terpisah begini, tidak ada lagi yang dipotong: dulu
        // satu gambar 21:9 dipaksa masuk kotak 32:9 dan kehilangan 34%
        // tingginya (17% atas + 17% bawah).
        aspect={32 / 9}
        maxDimension={MAX_DIMENSION.heroBanner}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        helpText="Disarankan 1920×540px (rasio 32:9), komposisi lebih melebar. Kalau dikosongkan, desktop memakai gambar HP di atas dan bagian atas-bawahnya akan terpotong."
        previewClassName="aspect-32/9 w-40 rounded-md"
        onUploadingChange={setUploadingDesktop}
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div>
          <Label htmlFor="new-banner-linkUrl" className="text-xs">Link Tujuan (opsional)</Label>
          <Input id="new-banner-linkUrl" name="linkUrl" placeholder="https://..." />
        </div>
        <div>
          <Label htmlFor="new-banner-sortOrder" className="text-xs">Urutan</Label>
          <Input id="new-banner-sortOrder" name="sortOrder" type="number" defaultValue={0} />
        </div>
      </div>

      <Button
        type="submit"
        disabled={pending || uploading || uploadingDesktop || !imageUrl}
        className="self-start"
      >
        {pending ? "..." : "Tambah Banner"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
