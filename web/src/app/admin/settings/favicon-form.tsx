"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/components/admin/image-upload-field";
import { MAX_DIMENSION } from "@/lib/image-processing";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function FaviconForm({
  initial,
  action,
  uploadFaviconFile,
}: {
  initial: { faviconUrl: string | null };
  action: (formData: FormData) => Promise<ActionResult>;
  uploadFaviconFile: (formData: FormData) => Promise<{ url?: string; error?: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [faviconUrl, setFaviconUrl] = useState(initial.faviconUrl ?? "");
  const [uploading, setUploading] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="faviconUrl" value={faviconUrl} />

      <ImageUploadField
        id="favicon-file"
        label="File favicon"
        value={faviconUrl}
        onChange={setFaviconUrl}
        upload={uploadFaviconFile}
        aspect={1}
        maxDimension={MAX_DIMENSION.favicon}
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        helpText="Ikon tab browser. Disarankan 256×256px, persegi (1:1) - dipaksa lewat crop di bawah biar tidak gepeng. Browser sering cache favicon lama — hard-refresh kalau belum berubah."
        previewClassName="size-12 rounded-md border bg-muted/40"
        previewFit="contain"
        onUploadingChange={setUploading}
      />

      <Button type="submit" disabled={pending || uploading || !faviconUrl} className="self-start">
        {pending ? "..." : "Simpan Favicon"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
