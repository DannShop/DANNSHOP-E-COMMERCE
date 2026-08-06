// Pemrosesan gambar di sisi browser: crop -> perkecil -> encode WebP, sebelum
// file dikirim ke server action. Dilakukan di client supaya server tidak perlu
// CPU untuk decode/encode gambar sama sekali, dan yang melintasi jaringan sudah
// berukuran kecil (biasanya 100-300KB dari file mentah belasan MB).

/** Rect crop dalam koordinat pixel gambar asli (format yang dipakai react-easy-crop). */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessImageOptions {
  /** Sisi terpanjang hasil akhir. Gambar lebih kecil dari ini tidak diperbesar. */
  maxDimension: number;
  /** Area crop; null/undefined berarti pakai seluruh gambar. */
  crop?: CropRect | null;
  /** Kualitas encode WebP 0-1. 0.85 praktis tidak terbedakan dari aslinya di layar. */
  quality?: number;
}

/**
 * SVG dan video sengaja tidak diproses: SVG kalau lewat canvas berubah jadi
 * raster dan pecah saat di-zoom, video jelas bukan ranah canvas gambar. Keduanya
 * diupload apa adanya.
 */
export function isProcessableImage(file: File): boolean {
  return file.type.startsWith("image/") && file.type !== "image/svg+xml";
}

async function decode(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * Menghasilkan File WebP baru hasil crop + perkecil. Kalau file tidak bisa
 * diproses (SVG/video) atau browser gagal di tengah jalan, file aslinya
 * dikembalikan apa adanya — upload tetap jalan, cuma tanpa optimasi.
 */
export async function processImage(file: File, opts: ProcessImageOptions): Promise<File> {
  if (!isProcessableImage(file)) return file;

  let source: ImageBitmap;
  try {
    source = await decode(file);
  } catch {
    return file;
  }

  try {
    const crop = opts.crop ?? { x: 0, y: 0, width: source.width, height: source.height };
    // Bulatkan & jepit ke dalam batas gambar: react-easy-crop bisa mengembalikan
    // pecahan atau nilai 1-2px di luar tepi, dan drawImage dengan rect di luar
    // batas menghasilkan pinggiran transparan.
    const sx = Math.max(0, Math.round(crop.x));
    const sy = Math.max(0, Math.round(crop.y));
    const sw = Math.max(1, Math.min(Math.round(crop.width), source.width - sx));
    const sh = Math.max(1, Math.min(Math.round(crop.height), source.height - sy));

    const scale = Math.min(1, opts.maxDimension / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    // Jalur utama: createImageBitmap melakukan crop + resample sekaligus dengan
    // kualitas tinggi. Jauh lebih tajam daripada satu kali drawImage untuk
    // penyusutan besar (mis. 4000px -> 512px), yang cenderung beraliasing.
    let drawable: ImageBitmap = source;
    let usedResizedBitmap = false;
    try {
      drawable = await createImageBitmap(file, sx, sy, sw, sh, {
        resizeWidth: outW,
        resizeHeight: outH,
        resizeQuality: "high",
      });
      usedResizedBitmap = true;
    } catch {
      drawable = source;
    }

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (usedResizedBitmap) {
      ctx.drawImage(drawable, 0, 0);
      drawable.close();
    } else {
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", opts.quality ?? 0.85),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.webp`, { type: "image/webp" });
  } catch {
    return file;
  } finally {
    source.close();
  }
}

/** Batas sisi terpanjang per jenis aset, disetel dari ukuran tampilnya di layar. */
export const MAX_DIMENSION = {
  /** Carousel banner: full-bleed, perlu tajam di layar desktop lebar. */
  heroBanner: 1920,
  /** Banner hero halaman produk: lebar maksimal kontainernya 672px, 2x untuk layar retina. */
  productBanner: 1280,
  /** Ikon produk: tampil terbesar 64px, disimpan jauh lebih besar supaya aman untuk pemakaian lain. */
  productIcon: 512,
  /** Logo situs di navbar. */
  siteLogo: 512,
  /** Logo metode pembayaran di strip footer & picker checkout. */
  paymentLogo: 256,
  /** Favicon - browser tab icon, kecil tapi disimpan cukup besar untuk retina. */
  favicon: 256,
} as const;
