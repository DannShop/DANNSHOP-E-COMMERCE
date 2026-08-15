"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAppIcons, isSupportedIconFile } from "@/lib/pwa/icon-builder";
import { DEFAULT_ICONS, type PwaAppKind, type PwaIconSet } from "@/lib/pwa/config";

/**
 * Pengunggah ikon aplikasi.
 *
 * SENGAJA TIDAK memakai ImageUploadField seperti logo/favicon, karena dua hal
 * yang dibutuhkan di sini tidak ada di sana:
 *
 *  1. Satu unggahan menghasilkan DUA berkas (any + maskable), sementara
 *     ImageUploadField mengunggah satu berkas dan mengembalikan satu URL.
 *  2. Tidak ada dialog crop. Untuk ikon aplikasi, memotong logo lebih merugikan
 *     daripada menyisakan ruang kosong — berkasnya di-contain, bukan di-crop.
 *
 * Pratinjaunya menampilkan DUA bentuk sekaligus: kotak membulat (cara iOS
 * menampilkannya) dan lingkaran (cara Android memotongnya). Tanpa yang kedua,
 * logo yang pinggirannya akan terpotong baru ketahuan setelah app terpasang.
 */
export function PwaIconField({
  kind,
  label,
  value,
  onChange,
  backgroundColor,
  upload,
  onUploadingChange,
}: {
  kind: PwaAppKind;
  label: string;
  /** null = sedang memakai ikon bawaan. */
  value: PwaIconSet | null;
  onChange: (icon: PwaIconSet | null) => void;
  /** Warna latar yang dicat di belakang logo. Ikut kotak warna di form induk. */
  backgroundColor: string;
  upload: (formData: FormData) => Promise<{ icon?: PwaIconSet; error?: string }>;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective = value ?? DEFAULT_ICONS[kind];
  const isCustom = value !== null;

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

    if (!isSupportedIconFile(file)) {
      setError("Format harus PNG, JPG, atau WebP. SVG belum didukung untuk ikon aplikasi.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const icons = await buildAppIcons(file, backgroundColor);
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("any", icons.any);
      fd.set("maskable", icons.maskable);

      const result = await upload(fd);
      if (result.error) setError(result.error);
      else if (result.icon) onChange(result.icon);
    } catch {
      setError("Gagal memproses gambar. Coba berkas lain.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`pwa-icon-${kind}`}>{label}</Label>

      <div className="flex items-start gap-4">
        <div className="flex shrink-0 gap-3">
          <figure className="flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL blob arbitrer milik admin, tanpa domain whitelist */}
            <img
              src={effective.any}
              alt=""
              className="size-16 rounded-[22%] bg-muted/40 object-cover ring-1 ring-foreground/10"
            />
            <figcaption className="text-[10px] text-muted-foreground">iOS</figcaption>
          </figure>

          <figure className="flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- sama seperti di atas */}
            <img
              src={effective.maskable}
              alt=""
              className="size-16 rounded-full bg-muted/40 object-cover ring-1 ring-foreground/10"
            />
            <figcaption className="text-[10px] text-muted-foreground">Android</figcaption>
          </figure>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            id={`pwa-icon-${kind}`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">
            {uploading
              ? "Memproses & mengunggah..."
              : isCustom
                ? "Ikon kustom sedang dipakai. Logo dipasang utuh di tengah — versi Android otomatis dikecilkan supaya tidak terpotong mask."
                : "Sedang memakai ikon bawaan. Unggah logo persegi (minimal 512×512) untuk menggantinya."}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {isCustom && !uploading && (
          <Button type="button" variant="outline" size="xs" onClick={() => onChange(null)}>
            Pakai bawaan
          </Button>
        )}
      </div>

      {/* URL disimpan di hidden input, bukan di-POST langsung: penyimpanannya
          ikut tombol Simpan form induk, sama pola dengan LogoForm/FaviconForm. */}
      <input type="hidden" name={`${kind}.icon.any`} value={value?.any ?? ""} />
      <input type="hidden" name={`${kind}.icon.maskable`} value={value?.maskable ?? ""} />
    </div>
  );
}
