import { put } from "@vercel/blob";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
// Gambar selalu lewat processImage() di client dulu (dikecilkan + di-encode
// ulang ke WebP, biasanya keluar 100-300KB) sebelum sampai sini, jadi 5MB
// sudah longgar untuk mereka. Video (logo situs) TIDAK diproses sama sekali
// di client (canvas tidak bisa memproses video - lihat komentar
// isProcessableImage di lib/image-processing.ts) - filenya mentah apa adanya
// dari device admin, dan bahkan klip pendek beberapa detik biasanya sudah
// lebih besar dari 5MB. Batas terpisah yang lebih longgar supaya upload video
// logo tidak ditolak cuma karena ukuran wajar untuk video, bukan gambar.
export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function uploadToBlob(
  folder: string,
  prefix: string,
  file: File,
  allowedTypes: Set<string>,
): Promise<{ url?: string; error?: string }> {
  if (file.size === 0) return { error: "File tidak ditemukan." };
  if (!allowedTypes.has(file.type)) {
    return { error: "Format file tidak didukung." };
  }
  const maxBytes = file.type.startsWith("video/") ? MAX_VIDEO_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return { error: `Ukuran file maksimal ${Math.round(maxBytes / (1024 * 1024))}MB.` };
  }

  const ext = file.name.split(".").pop() ?? "bin";
  try {
    const blob = await put(`${folder}/${prefix}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return { url: blob.url };
  } catch (e) {
    console.error(`uploadToBlob (${folder}) gagal`, { prefix, error: e });
    return { error: "Gagal upload file, coba lagi." };
  }
}
