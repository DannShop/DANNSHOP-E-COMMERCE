"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const result = await uploadBannerImage(fd);
      if (result.error) setUploadError(result.error);
      else if (result.url) setImageUrl(result.url);
    } catch {
      setUploadError("Gagal upload file, coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <div>
        <Label htmlFor="new-banner-file" className="text-xs">Gambar Banner</Label>
        <Input id="new-banner-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleFileChange} disabled={uploading} />
        {uploading && <p className="mt-1 text-xs text-muted-foreground">Mengunggah...</p>}
        {uploadError && <p className="mt-1 text-xs text-destructive">{uploadError}</p>}
        {imageUrl && (
          <div className="relative mt-2 aspect-21/9 w-full max-w-sm overflow-hidden rounded-md border">
            <Image src={imageUrl} alt="Preview banner" fill sizes="384px" className="object-cover" unoptimized />
          </div>
        )}
      </div>

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

      <Button type="submit" disabled={pending || !imageUrl} className="self-start">
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
