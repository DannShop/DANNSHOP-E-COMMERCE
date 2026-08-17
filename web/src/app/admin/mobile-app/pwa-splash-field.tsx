"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildSplashImage, isSupportedSplashFile } from "@/lib/pwa/splash-builder";
import type { PwaAppKind, PwaImage } from "@/lib/pwa/config";

type Orientation = "portrait" | "landscape";

/**
 * Pengunggah satu gambar layar pembuka.
 *
 * SENGAJA TIDAK memakai ImageUploadField seperti logo/banner, karena dua hal:
 *
 *  1. Keluarannya harus JPEG dengan UKURAN yang ikut tersimpan. ImageUploadField
 *     mengeluarkan WebP dan hanya mengembalikan satu URL - dan tanpa ukurannya,
 *     perender layar pembuka iOS tidak bisa menghitung skalanya.
 *  2. Tidak ada dialog crop dengan rasio tetap. Layar iOS punya rasio yang
 *     berbeda-beda dari 0,45 (iPhone) sampai 0,75 (iPad); satu rasio crop apa
 *     pun akan salah untuk sebagian besar perangkat. Yang dilakukan sebagai
 *     gantinya adalah menaruh gambar utuh lalu meng-cover-nya per perangkat,
 *     dan itulah kenapa peringatan "taruh yang penting di tengah" ada di bawah.
 */
export function PwaSplashField({
  kind,
  orientation,
  label,
  help,
  value,
  onChange,
  backgroundColor,
  upload,
  onUploadingChange,
}: {
  kind: PwaAppKind;
  orientation: Orientation;
  label: string;
  help: string;
  /** null = layar pembuka dirakit otomatis dari warna + ikon. */
  value: PwaImage | null;
  onChange: (image: PwaImage | null) => void;
  backgroundColor: string;
  upload: (formData: FormData) => Promise<{ image?: PwaImage; error?: string }>;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setBusy = useCallback(
    (busy: boolean) => {
      setUploading(busy);
      onUploadingChange?.(busy);
    },
    [onUploadingChange],
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset supaya berkas yang sama bisa dipilih ulang
    if (!file) return;

    if (!isSupportedSplashFile(file)) {
      setError("Format harus PNG, JPG, atau WebP.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const built = await buildSplashImage(file, backgroundColor);
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("orientation", orientation);
      fd.set("file", built.file);
      fd.set("width", String(built.width));
      fd.set("height", String(built.height));

      const result = await upload(fd);
      if (result.error) setError(result.error);
      else if (result.image) onChange(result.image);
    } catch {
      setError("Gagal memproses gambar. Coba berkas lain.");
    } finally {
      setBusy(false);
    }
  }

  // Bingkai pratinjau meniru rasio layar yang paling mungkin dipakai, bukan
  // rasio gambarnya sendiri - yang perlu dilihat admin adalah apa yang TERPOTONG
  // saat di-cover, bukan gambarnya yang utuh.
  const frame = orientation === "portrait" ? "h-28 w-[3.9rem]" : "h-[3.9rem] w-28";

  return (
    <div className="space-y-2">
      <Label htmlFor={`pwa-splash-${kind}-${orientation}`}>{label}</Label>

      <div className="flex items-start gap-4">
        <div
          className={`${frame} shrink-0 overflow-hidden rounded-lg bg-cover bg-center ring-1 ring-foreground/10`}
          style={{
            backgroundColor,
            backgroundImage: value ? `url(${JSON.stringify(value.url)})` : undefined,
          }}
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            id={`pwa-splash-${kind}-${orientation}`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">
            {uploading ? "Memproses & mengunggah..." : help}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {value && !uploading && (
          <Button type="button" variant="outline" size="xs" onClick={() => onChange(null)}>
            Hapus
          </Button>
        )}
      </div>

      {/* Sama pola dengan ikon: URL & ukurannya ikut tombol Simpan form induk,
          bukan disimpan sendiri saat unggahan selesai. */}
      <input type="hidden" name={`${kind}.splash.${orientation}.url`} value={value?.url ?? ""} />
      <input
        type="hidden"
        name={`${kind}.splash.${orientation}.width`}
        value={value?.width ?? ""}
      />
      <input
        type="hidden"
        name={`${kind}.splash.${orientation}.height`}
        value={value?.height ?? ""}
      />
    </div>
  );
}
