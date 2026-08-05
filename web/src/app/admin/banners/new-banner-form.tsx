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
  const [uploading, setUploading] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <ImageUploadField
        id="new-banner-file"
        label="Gambar Banner"
        value={imageUrl}
        onChange={setImageUrl}
        upload={uploadBannerImage}
        // Carousel tampil 21:9 di HP dan 32:9 di desktop. Crop dikunci ke 21:9
        // (versi HP) karena mayoritas pengunjung memakai HP; di desktop sisi
        // atas-bawahnya yang terpotong sedikit.
        aspect={21 / 9}
        maxDimension={MAX_DIMENSION.heroBanner}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        helpText="Tampil di carousel beranda. Area dalam kotak crop itulah yang terlihat di HP."
        previewClassName="aspect-21/9 w-40 rounded-md"
        onUploadingChange={setUploading}
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

      <Button type="submit" disabled={pending || uploading || !imageUrl} className="self-start">
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
