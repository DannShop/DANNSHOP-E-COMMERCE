"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      const result = await uploadLogoFile(fd);
      if (result.error) {
        setUploadError(result.error);
      } else if (result.url) {
        setLogoUrl(result.url);
        setLogoType(file.type.startsWith("video/") ? "video" : "image");
      }
    } catch {
      setUploadError("Gagal upload file, coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="logoType" value={logoType} />

      <div>
        <Label htmlFor="logo-file" className="text-xs">File logo (gambar atau video)</Label>
        <Input
          id="logo-file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading && <p className="mt-1 text-xs text-muted-foreground">Mengunggah...</p>}
        {uploadError && <p className="mt-1 text-xs text-destructive">{uploadError}</p>}
        {logoUrl && (
          <div className="mt-2 flex h-12 w-40 items-center overflow-hidden rounded-md border bg-muted/40 px-2">
            {logoType === "video" ? (
              <video src={logoUrl} autoPlay loop muted playsInline className="h-full w-full object-contain" />
            ) : (
              <div className="relative h-full w-full">
                <Image src={logoUrl} alt="Preview logo" fill sizes="160px" className="object-contain" unoptimized />
              </div>
            )}
          </div>
        )}
      </div>

      <Button type="submit" disabled={pending || !logoUrl} className="self-start">
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
