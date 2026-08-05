"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isProcessableImage, processImage, type CropRect } from "@/lib/image-processing";

export interface ImageUploadFieldProps {
  id: string;
  label: string;
  /** URL aset yang tersimpan sekarang; string kosong berarti belum ada. */
  value: string;
  onChange: (url: string) => void;
  /** Server action pengunggah; menerima FormData berisi field "file". */
  upload: (formData: FormData) => Promise<{ url?: string; error?: string }>;
  /** Field tambahan yang ikut dikirim ke server action (mis. productId, code). */
  uploadFields?: Record<string, string>;
  /**
   * Rasio crop (lebar/tinggi). Kalau tidak diisi, dialog crop dilewati dan file
   * hanya dikecilkan — dipakai untuk aset yang tampil `object-contain` di kotak
   * tetap (logo), di mana crop tidak mengubah apa pun.
   */
  aspect?: number;
  /**
   * Sisi terpanjang hasil akhir; pakai konstanta MAX_DIMENSION. Kalau tidak
   * diisi DAN tanpa crop, file diunggah persis apa adanya — tanpa perkecilan
   * maupun encode ulang. Dipakai untuk aset yang ketajamannya jadi nilai jual
   * (mis. logo metode pembayaran).
   */
  maxDimension?: number;
  accept: string;
  helpText?: string;
  /** Kelas kotak preview, menentukan bentuk & ukurannya. */
  previewClassName?: string;
  previewFit?: "cover" | "contain";
  /** Dipakai form induk untuk menonaktifkan tombol simpan selama upload jalan. */
  onUploadingChange?: (uploading: boolean) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/** Logo situs boleh berupa video, jadi preview harus bisa membedakannya dari gambar. */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

export function ImageUploadField({
  id,
  label,
  value,
  onChange,
  upload,
  uploadFields,
  aspect,
  maxDimension,
  accept,
  helpText,
  previewClassName = "size-14 rounded-md",
  previewFit = "cover",
  onUploadingChange,
}: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  // State dialog crop. objectUrl dilepas manual karena browser tidak pernah
  // membebaskannya sendiri selama tab masih hidup.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const pendingFileRef = useRef<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const croppedAreaRef = useRef<CropRect | null>(null);

  const closeCropper = useCallback(() => {
    setCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    pendingFileRef.current = null;
    croppedAreaRef.current = null;
    setCrop({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
  }, []);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const uploadFile = useCallback(
    async (file: File, cropRect: CropRect | null) => {
      setUploading(true);
      setError(null);
      try {
        // Tanpa maxDimension dan tanpa crop berarti file dilewatkan utuh —
        // processImage sengaja tidak dipanggil supaya tidak ada encode ulang.
        const processed =
          maxDimension === undefined && !cropRect
            ? file
            : await processImage(file, { maxDimension: maxDimension ?? Infinity, crop: cropRect });
        const fd = new FormData();
        fd.set("file", processed);
        for (const [key, val] of Object.entries(uploadFields ?? {})) fd.set(key, val);

        const result = await upload(fd);
        if (result.error) setError(result.error);
        else if (result.url) onChange(result.url);
      } catch {
        setError("Gagal upload file, coba lagi.");
      } finally {
        setUploading(false);
      }
    },
    [maxDimension, onChange, upload, uploadFields],
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset supaya file yang sama bisa dipilih ulang
    if (!file) return;

    // Crop hanya masuk akal untuk gambar raster dengan rasio target. SVG dan
    // video langsung diteruskan; processImage juga akan melewatkannya.
    if (aspect && isProcessableImage(file)) {
      pendingFileRef.current = file;
      setCropSrc(URL.createObjectURL(file));
      setError(null);
      return;
    }
    void uploadFile(file, null);
  }

  async function handleConfirmCrop() {
    const file = pendingFileRef.current;
    const area = croppedAreaRef.current;
    if (!file) return;
    closeCropper();
    await uploadFile(file, area);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-start gap-3">
        {value && (
          <div
            className={cn(
              "relative shrink-0 overflow-hidden bg-muted/50 ring-1 ring-foreground/10",
              previewClassName,
            )}
          >
            {isVideoUrl(value) ? (
              <video
                src={value}
                autoPlay
                loop
                muted
                playsInline
                className={cn("size-full", previewFit === "cover" ? "object-cover" : "object-contain")}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- preview URL arbitrer dari admin, tanpa domain whitelist */
              <img
                src={value}
                alt=""
                className={cn("size-full", previewFit === "cover" ? "object-cover" : "object-contain")}
              />
            )}
          </div>
        )}

        <div className="flex-1 space-y-1">
          <Input id={id} type="file" accept={accept} onChange={handleFileChange} disabled={uploading} />
          <p className="text-xs text-muted-foreground">
            {uploading
              ? "Memproses & mengunggah..."
              : (helpText ??
                "Gambar otomatis dikecilkan & dikonversi ke WebP sebelum diunggah.")}
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {value && !uploading && (
          <Button type="button" variant="outline" size="xs" onClick={() => onChange("")}>
            Hapus
          </Button>
        )}
      </div>

      <Dialog.Root open={cropSrc !== null} onOpenChange={(open) => !open && closeCropper()}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[var(--radius)] bg-card p-4 shadow-xl ring-1 ring-foreground/10">
            <Dialog.Title className="font-heading text-base font-bold">Atur posisi gambar</Dialog.Title>
            <p className="text-xs text-muted-foreground">
              Geser untuk memindahkan, scroll atau pakai slider untuk memperbesar. Area di dalam
              kotak inilah yang akan tampil.
            </p>

            <div className="relative h-72 w-full overflow-hidden rounded-md bg-neutral-900">
              {cropSrc && (
                <Cropper
                  image={cropSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspect ?? 1}
                  minZoom={MIN_ZOOM}
                  maxZoom={MAX_ZOOM}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, areaPixels: Area) => {
                    croppedAreaRef.current = areaPixels;
                  }}
                />
              )}
            </div>

            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              Zoom
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={closeCropper}>
                Batal
              </Button>
              <Button type="button" size="sm" onClick={handleConfirmCrop}>
                Pakai gambar ini
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
