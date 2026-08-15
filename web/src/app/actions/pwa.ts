import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { SHORT_NAME_MAX, type PwaIconSet } from "@/lib/pwa/config";
import { savePwaSettings } from "@/lib/pwa/settings";

export type ActionResult = { ok?: string; error?: string };

// Hanya PNG. Ikon dibentuk lib/pwa/icon-builder.ts di browser dan SELALU keluar
// sebagai PNG 512x512 - format lain di sini berarti berkas tidak lewat jalur itu.
const ALLOWED_ICON_TYPES = new Set(["image/png"]);

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, updatedAt: true },
  });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, detail?: object) {
  await db.adminActionLog.create({ data: { adminId, action, targetType: "site_setting", detail } });
}

/**
 * Mengunggah SEPASANG ikon (any + maskable) sekaligus.
 *
 * Sepasang, bukan satu per satu, karena parsePwaSettings() membuang pasangan
 * yang tidak lengkap. Kalau varian maskable gagal terunggah sementara yang any
 * berhasil, hasilnya bukan "ikon setengah jadi" melainkan kembali ke ikon
 * bawaan - dan admin tidak akan mengerti kenapa unggahannya seperti diabaikan.
 */
export async function uploadPwaIcon(
  formData: FormData,
): Promise<{ icon?: PwaIconSet; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const kind = formData.get("kind") === "admin" ? "admin" : "toko";
  const anyFile = formData.get("any");
  const maskableFile = formData.get("maskable");
  if (!(anyFile instanceof File) || !(maskableFile instanceof File)) {
    return { error: "Berkas ikon tidak ditemukan." };
  }

  const stamp = Date.now();
  const anyResult = await uploadToBlob("pwa-icons", `${kind}-${stamp}`, anyFile, ALLOWED_ICON_TYPES);
  if (anyResult.error || !anyResult.url) return { error: anyResult.error ?? "Gagal upload ikon." };

  const maskableResult = await uploadToBlob(
    "pwa-icons",
    `${kind}-maskable-${stamp}`,
    maskableFile,
    ALLOWED_ICON_TYPES,
  );
  if (maskableResult.error || !maskableResult.url) {
    return { error: maskableResult.error ?? "Gagal upload ikon maskable." };
  }

  return { icon: { any: anyResult.url, maskable: maskableResult.url } };
}

// URL ikon boleh kosong (= pakai bawaan) atau harus sepasang URL yang sah.
const iconSchema = z
  .object({ any: z.string().trim(), maskable: z.string().trim() })
  .refine((v) => (!v.any && !v.maskable) || (URL.canParse(v.any) && URL.canParse(v.maskable)), {
    message: "URL ikon tidak valid",
  })
  .transform((v): PwaIconSet | null => (v.any && v.maskable ? { any: v.any, maskable: v.maskable } : null));

const appSchema = z.object({
  name: z.string().trim().max(60, "Nama aplikasi maksimal 60 karakter"),
  shortName: z.string().trim().max(SHORT_NAME_MAX, `Nama pendek maksimal ${SHORT_NAME_MAX} karakter`),
  icon: iconSchema,
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex, mis. #7C3AED");

const settingsSchema = z.object({
  toko: appSchema,
  admin: appSchema,
  themeColor: hexColor,
  backgroundColor: hexColor,
});

function readApp(formData: FormData, prefix: string) {
  return {
    name: formData.get(`${prefix}.name`) ?? "",
    shortName: formData.get(`${prefix}.shortName`) ?? "",
    icon: {
      any: formData.get(`${prefix}.icon.any`) ?? "",
      maskable: formData.get(`${prefix}.icon.maskable`) ?? "",
    },
  };
}

export async function savePwaAppSettings(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = settingsSchema.safeParse({
    toko: readApp(formData, "toko"),
    admin: readApp(formData, "admin"),
    themeColor: formData.get("themeColor"),
    backgroundColor: formData.get("backgroundColor"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await savePwaSettings(parsed.data);
  await logAdmin(admin.adminId, "site_setting.save_pwa", {
    ikonToko: parsed.data.toko.icon ? "kustom" : "bawaan",
    ikonAdmin: parsed.data.admin.icon ? "kustom" : "bawaan",
  });

  revalidatePath("/admin/mobile-app");
  // Manifest toko disisipkan ke SETIAP halaman lewat layout root, dan manifest
  // admin punya route sendiri - keduanya harus ikut diperbarui, bukan cuma
  // halaman pengaturannya.
  revalidatePath("/manifest.webmanifest");
  revalidatePath("/admin/app.webmanifest");
  revalidatePath("/", "layout");

  return {
    ok: "Pengaturan aplikasi tersimpan. App yang sudah terpasang di HP memperbarui ikon & namanya sendiri dalam beberapa jam — atau langsung, kalau dihapus lalu dipasang ulang.",
  };
}
