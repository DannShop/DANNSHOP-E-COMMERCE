import { SPLASH_MAX_DIMENSION } from "@/lib/pwa/config";

// Menormalkan gambar layar pembuka yang diunggah admin, DI BROWSER.
//
// Sejalan dengan icon-builder.ts dan lib/image-processing.ts: decode/encode
// gambar dikerjakan klien supaya server tidak perlu CPU untuk itu, dan yang
// melintasi jaringan sudah berukuran akhir.
//
// Dua keputusan yang berbeda dari processImage(), keduanya karena gambar ini
// nantinya dibaca ULANG oleh perender di server (route /pwa/splash), bukan cuma
// oleh browser:
//
//  1. Keluarannya JPEG, bukan WebP. Perender gambar di server hanya dijamin
//     mengerti PNG dan JPEG; WebP yang tidak terbaca berarti layar pembuka iOS
//     gagal dirender, dan gejalanya layar kosong tanpa satu pun pesan galat.
//     JPEG juga jauh lebih kecil daripada PNG untuk gambar berfoto/bergradasi,
//     yang memang bentuk umum layar pembuka.
//  2. Ukurannya IKUT DISIMPAN. Perender di server harus menghitung skala
//     "cover" ke ukuran layar tiap perangkat, dan satu-satunya alternatif dari
//     menyimpan angkanya adalah mengunduh lalu mendekode gambarnya hanya untuk
//     mengukur — di setiap permintaan.

export interface BuiltSplash {
  file: File;
  width: number;
  height: number;
}

/**
 * Berkas yang bisa dipakai sebagai layar pembuka.
 *
 * SVG ditolak dengan alasan yang sama seperti pada ikon: createImageBitmap()
 * menolak SVG tanpa ukuran intrinsik di sebagian browser, dan gagalnya muncul
 * sebagai "gambar tidak jadi" tanpa sebab yang jelas.
 */
export function isSupportedSplashFile(file: File): boolean {
  return file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
}

/**
 * Mengecilkan gambar ke batas aman lalu mengencode ulang jadi JPEG.
 *
 * Gambar yang sudah lebih kecil dari batas TIDAK diperbesar di sini — pembesaran
 * dikerjakan sekali saja saat dirender ke ukuran perangkat, dan memperbesar dua
 * kali cuma menumpuk pelunakan.
 */
export async function buildSplashImage(
  file: File,
  backgroundColor: string,
  maxSide: number = SPLASH_MAX_DIMENSION,
): Promise<BuiltSplash> {
  const source = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser ini tidak mendukung canvas 2D.");

    // JPEG tidak punya kanal alfa. Tanpa cat dasar, PNG berlatar transparan
    // keluar sebagai gambar berlatar HITAM — bukan berlatar warna app.
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Penyusutan lewat createImageBitmap (bukan sekali drawImage) jauh lebih
    // tajam untuk turunan besar. Sama seperti icon-builder & processImage.
    let drawable: ImageBitmap | null = null;
    try {
      drawable = await createImageBitmap(file, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "high",
      });
      ctx.drawImage(drawable, 0, 0);
    } catch {
      ctx.drawImage(source, 0, 0, width, height);
    } finally {
      drawable?.close();
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new Error("Gagal membuat gambar layar pembuka.");

    const base = file.name.replace(/\.[^.]+$/, "") || "splash";
    return {
      file: new File([blob], `${base}-${width}x${height}.jpg`, { type: "image/jpeg" }),
      width,
      height,
    };
  } finally {
    source.close();
  }
}
