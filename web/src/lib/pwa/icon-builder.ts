import { ICON_SIZE_PX } from "@/lib/pwa/config";

// Membuat ikon aplikasi dari satu berkas yang diunggah admin, DI BROWSER.
//
// Sejalan dengan lib/image-processing.ts: pemrosesan gambar dikerjakan klien
// supaya server tidak perlu CPU untuk decode/encode, dan yang melintasi jaringan
// sudah berukuran akhir.
//
// Dua hal yang berbeda dari processImage(), dan keduanya disengaja:
//
//  1. Keluarannya PNG, bukan WebP. iOS tidak dijamin bisa memakai WebP sebagai
//     ikon layar utama, dan ikon yang gagal dimuat berarti app tidak bisa
//     dipasang sama sekali.
//  2. Gambarnya di-CONTAIN, bukan di-crop. Ini ikon aplikasi: logo yang
//     terpotong pinggirannya lebih buruk daripada logo yang punya ruang kosong
//     di kiri-kanan.

/** Bagian sisi kanvas yang boleh diisi logo pada varian "any". */
const COVERAGE_ANY = 0.8;

/**
 * Bagian sisi kanvas yang boleh diisi logo pada varian "maskable".
 *
 * Android memotong ikon dengan mask (lingkaran, squircle, kotak membulat —
 * berbeda-beda antar peluncur). Zona amannya lingkaran berdiameter 80% sisi
 * kanvas, yaitu ~410px pada kanvas 512. Kotak berisi 58% sisi kanvas (297px)
 * punya diagonal ~420px — sedikit di luar lingkaran itu, tapi hanya pada empat
 * titik sudut kotak pembatas, yang pada logo nyata hampir selalu ruang kosong.
 */
const COVERAGE_MASKABLE = 0.58;

export interface BuiltIcons {
  any: File;
  maskable: File;
}

/**
 * Berkas yang bisa diproses jadi ikon.
 *
 * SVG DITOLAK dengan sengaja: createImageBitmap() menolak SVG tanpa ukuran
 * intrinsik di sebagian browser, dan kegagalannya muncul sebagai "ikon tidak
 * jadi" tanpa sebab yang jelas. Menolaknya di depan memberi pesan yang bisa
 * ditindaklanjuti.
 */
export function isSupportedIconFile(file: File): boolean {
  return file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
}

async function render(
  source: ImageBitmap,
  file: File,
  backgroundColor: string,
  coverage: number,
  name: string,
): Promise<File> {
  const box = Math.round(ICON_SIZE_PX * coverage);
  const scale = Math.min(box / source.width, box / source.height);
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE_PX;
  canvas.height = ICON_SIZE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini tidak mendukung canvas 2D.");

  // Latar SELALU dicat penuh sampai tepi, tidak pernah transparan. iOS mengganti
  // transparansi ikon layar utama dengan HITAM, dan Android memakai piksel tepi
  // untuk melebarkan ikon di balik mask-nya.
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, ICON_SIZE_PX, ICON_SIZE_PX);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Penyusutan lewat createImageBitmap (bukan sekali drawImage) jauh lebih tajam
  // untuk turunan besar, mis. 4000px -> 300px. Sama seperti processImage().
  let drawable: ImageBitmap | null = null;
  try {
    drawable = await createImageBitmap(file, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: "high",
    });
    ctx.drawImage(drawable, Math.round((ICON_SIZE_PX - w) / 2), Math.round((ICON_SIZE_PX - h) / 2));
  } catch {
    ctx.drawImage(source, Math.round((ICON_SIZE_PX - w) / 2), Math.round((ICON_SIZE_PX - h) / 2), w, h);
  } finally {
    drawable?.close();
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Gagal membuat ikon PNG.");
  return new File([blob], name, { type: "image/png" });
}

/**
 * Menghasilkan sepasang ikon 512×512 PNG dari satu berkas unggahan.
 *
 * Selalu dua-duanya sekaligus. parsePwaSettings() menolak pasangan yang tidak
 * lengkap, jadi tidak ada gunanya mengembalikan salah satu saja.
 */
export async function buildAppIcons(file: File, backgroundColor: string): Promise<BuiltIcons> {
  const source = await createImageBitmap(file);
  try {
    const base = file.name.replace(/\.[^.]+$/, "") || "icon";
    const [any, maskable] = await Promise.all([
      render(source, file, backgroundColor, COVERAGE_ANY, `${base}-512.png`),
      render(source, file, backgroundColor, COVERAGE_MASKABLE, `${base}-maskable-512.png`),
    ]);
    return { any, maskable };
  } finally {
    source.close();
  }
}
