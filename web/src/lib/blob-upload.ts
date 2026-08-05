import { put } from "@vercel/blob";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "Ukuran file maksimal 5MB." };
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
