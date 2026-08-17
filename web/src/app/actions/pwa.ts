import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { SHORT_NAME_MAX, type PwaImage, type PwaIconSet } from "@/lib/pwa/config";
import { savePwaSettings } from "@/lib/pwa/settings";
import { requireAdminSession } from "@/lib/auth/admin-gate";

export type ActionResult = { ok?: string; error?: string };

// Hanya PNG. Ikon dibentuk lib/pwa/icon-builder.ts di browser dan SELALU keluar
// sebagai PNG 512x512 - format lain di sini berarti berkas tidak lewat jalur itu.
const ALLOWED_ICON_TYPES = new Set(["image/png"]);

// Hanya JPEG, dengan alasan yang sama: lib/pwa/splash-builder.ts selalu
// mengeluarkan JPEG. Formatnya bukan selera - gambar ini dibaca ulang oleh
// perender di server, yang hanya dijamin mengerti PNG dan JPEG.
const ALLOWED_SPLASH_TYPES = new Set(["image/jpeg"]);

/** Batas yang sama dipakai parsePwaSettings saat membaca kembali dari DB. */
const MAX_IMAGE_SIDE = 10000;

const requireAdmin = () => requireAdminSession("system.manage");

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

  return {
    icon: {
      any: anyResult.url,
      maskable: maskableResult.url,
      // Warna yang benar-benar dicat ke dalam berkasnya, dicatat di sini supaya
      // panel bisa memberi tahu admin kalau nanti warna latarnya diganti tanpa
      // ikonnya ikut dibuat ulang.
      background: typeof formData.get("background") === "string" ? String(formData.get("background")) : "",
    },
  };
}

/**
 * Mengunggah satu gambar layar pembuka.
 *
 * Lebar & tinggi ikut disimpan, bukan diukur ulang di server: perender layar
 * pembuka iOS butuh angka itu untuk menghitung skala "cover" ke tiap ukuran
 * perangkat, dan mengukurnya berarti mengunduh + mendekode gambar di setiap
 * permintaan. Angkanya datang dari browser yang memang baru saja membuat
 * gambarnya, dan salah nilai paling buruk menghasilkan skala yang meleset -
 * tidak ada yang bisa dibelanjakan dari sini.
 */
export async function uploadPwaSplash(
  formData: FormData,
): Promise<{ image?: PwaImage; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const kind = formData.get("kind") === "admin" ? "admin" : "toko";
  const orientation = formData.get("orientation") === "landscape" ? "landscape" : "portrait";
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Berkas layar pembuka tidak ditemukan." };

  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_SIDE ||
    height > MAX_IMAGE_SIDE
  ) {
    return { error: "Ukuran gambar tidak terbaca. Coba berkas lain." };
  }

  const result = await uploadToBlob(
    "pwa-splash",
    `${kind}-${orientation}-${Date.now()}`,
    file,
    ALLOWED_SPLASH_TYPES,
  );
  if (result.error || !result.url) {
    return { error: result.error ?? "Gagal upload gambar layar pembuka." };
  }
  return { image: { url: result.url, width, height } };
}

// URL ikon boleh kosong (= pakai bawaan) atau harus sepasang URL yang sah.
const iconSchema = z
  .object({
    any: z.string().trim(),
    maskable: z.string().trim(),
    // Boleh kosong: ikon yang tersimpan dari versi kode sebelum warna ini
    // dicatat tetap harus bisa disimpan ulang tanpa dipaksa diunggah lagi.
    background: z.string().trim(),
  })
  .refine((v) => (!v.any && !v.maskable) || (URL.canParse(v.any) && URL.canParse(v.maskable)), {
    message: "URL ikon tidak valid",
  })
  .transform((v): PwaIconSet | null =>
    v.any && v.maskable ? { any: v.any, maskable: v.maskable, background: v.background } : null,
  );

// Gambar layar pembuka: boleh kosong (= layar pembuka dirakit otomatis), atau
// harus URL sah DENGAN ukuran. URL tanpa ukuran ditolak, bukan diterima dengan
// ukuran tebakan - gambar yang tidak bisa dihitung skalanya akan tampil meleset
// entah ke mana, dan itu jauh lebih membingungkan daripada ditolak di depan.
const imageSchema = z
  .object({
    url: z.string().trim(),
    width: z.coerce.number().int().min(0).max(MAX_IMAGE_SIDE),
    height: z.coerce.number().int().min(0).max(MAX_IMAGE_SIDE),
  })
  .refine((v) => !v.url || (URL.canParse(v.url) && v.width > 0 && v.height > 0), {
    message: "Gambar layar pembuka tidak valid",
  })
  .transform((v): PwaImage | null =>
    v.url ? { url: v.url, width: v.width, height: v.height } : null,
  );

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex, mis. #7C3AED");

const appSchema = z.object({
  name: z.string().trim().max(60, "Nama aplikasi maksimal 60 karakter"),
  shortName: z.string().trim().max(SHORT_NAME_MAX, `Nama pendek maksimal ${SHORT_NAME_MAX} karakter`),
  icon: iconSchema,
  themeColor: hexColor,
  backgroundColor: hexColor,
  splash: z.object({ portrait: imageSchema, landscape: imageSchema }),
});

const settingsSchema = z.object({ toko: appSchema, admin: appSchema });

function readImage(formData: FormData, prefix: string) {
  return {
    url: formData.get(`${prefix}.url`) ?? "",
    width: formData.get(`${prefix}.width`) ?? 0,
    height: formData.get(`${prefix}.height`) ?? 0,
  };
}

function readApp(formData: FormData, prefix: string) {
  return {
    name: formData.get(`${prefix}.name`) ?? "",
    shortName: formData.get(`${prefix}.shortName`) ?? "",
    icon: {
      any: formData.get(`${prefix}.icon.any`) ?? "",
      maskable: formData.get(`${prefix}.icon.maskable`) ?? "",
      background: formData.get(`${prefix}.icon.background`) ?? "",
    },
    themeColor: formData.get(`${prefix}.themeColor`),
    backgroundColor: formData.get(`${prefix}.backgroundColor`),
    splash: {
      portrait: readImage(formData, `${prefix}.splash.portrait`),
      landscape: readImage(formData, `${prefix}.splash.landscape`),
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
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await savePwaSettings(parsed.data);
  await logAdmin(admin.adminId, "site_setting.save_pwa", {
    ikonToko: parsed.data.toko.icon ? "kustom" : "bawaan",
    ikonAdmin: parsed.data.admin.icon ? "kustom" : "bawaan",
    splashToko: parsed.data.toko.splash.portrait ? "kustom" : "otomatis",
    splashAdmin: parsed.data.admin.splash.portrait ? "kustom" : "otomatis",
  });

  revalidatePath("/admin/mobile-app");
  // Manifest toko disisipkan ke SETIAP halaman lewat layout root, dan manifest
  // admin punya route sendiri - keduanya harus ikut diperbarui, bukan cuma
  // halaman pengaturannya.
  revalidatePath("/manifest.webmanifest");
  revalidatePath("/admin/app.webmanifest");
  revalidatePath("/", "layout");
  // Layout admin punya daftar <link rel="apple-touch-startup-image"> sendiri.
  // Tanpa baris ini, layar pembuka iOS app toko ikut diperbarui sementara app
  // admin terus menunjuk gambar versi lama.
  //
  // Gambarnya sendiri tidak perlu dibatalkan cache-nya: URL-nya membawa sidik
  // jari pengaturan, jadi pengaturan yang berubah menghasilkan URL yang berbeda.
  revalidatePath("/admin", "layout");

  return {
    ok: "Pengaturan aplikasi tersimpan. App yang sudah terpasang di HP memperbarui ikon & namanya sendiri dalam beberapa jam — atau langsung, kalau dihapus lalu dipasang ulang.",
  };
}
