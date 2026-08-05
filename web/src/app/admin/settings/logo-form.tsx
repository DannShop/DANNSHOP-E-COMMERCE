"use client";

import { useActionState, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageUploadField, isVideoUrl } from "@/components/admin/image-upload-field";
import { MAX_DIMENSION } from "@/lib/image-processing";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function LogoForm({
  initial,
  action,
  uploadLogoFile,
}: {
  initial: { logoUrl: string | null; logoType: "image" | "video" };
  action: (formData: FormData) => Promise<ActionResult>;
  uploadLogoFile: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [logoType, setLogoType] = useState<"image" | "video">(initial.logoType);
  const [uploading, setUploading] = useState(false);

  // Jenis logo disimpulkan dari ekstensi URL hasil upload: uploadToBlob
  // mempertahankan ekstensi file, dan gambar selalu keluar sebagai .webp.
  const handleUploaded = useCallback((url: string) => {
    setLogoUrl(url);
    if (url) setLogoType(isVideoUrl(url) ? "video" : "image");
  }, []);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="logoType" value={logoType} />

      <ImageUploadField
        id="logo-file"
        label="File logo (gambar atau video)"
        value={logoUrl}
        onChange={handleUploaded}
        upload={uploadLogoFile}
        // Tanpa crop: logo tampil object-contain di kotak tetap, jadi memotongnya
        // tidak mengubah apa pun. Video juga tidak bisa lewat canvas.
        maxDimension={MAX_DIMENSION.siteLogo}
        accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
        helpText="Tampil di navbar. Gambar otomatis dikecilkan; SVG dan video diunggah apa adanya."
        previewClassName="h-12 w-40 rounded-md border bg-muted/40"
        previewFit="contain"
        onUploadingChange={setUploading}
      />

      <Button type="submit" disabled={pending || uploading || !logoUrl} className="self-start">
        {pending ? "..." : "Simpan Logo"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
