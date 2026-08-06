import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { z } from "zod";

export type ActionResult = { ok?: string; error?: string };

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
]);

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "site_setting", detail },
  });
}

export async function uploadLogoFile(formData: FormData): Promise<{ url?: string; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "File tidak ditemukan." };
  return uploadToBlob("site-settings", `logo-${Date.now()}`, file, ALLOWED_LOGO_TYPES);
}

const logoSchema = z.object({
  logoUrl: z.string().url("URL logo tidak valid"),
  logoType: z.enum(["image", "video"]),
});

export async function saveLogo(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = logoSchema.safeParse({
    logoUrl: formData.get("logoUrl"),
    logoType: formData.get("logoType"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.$transaction([
    db.siteSetting.upsert({ where: { key: "logo_url" }, update: { value: parsed.data.logoUrl }, create: { key: "logo_url", value: parsed.data.logoUrl } }),
    db.siteSetting.upsert({ where: { key: "logo_type" }, update: { value: parsed.data.logoType }, create: { key: "logo_type", value: parsed.data.logoType } }),
  ]);
  await logAdmin(admin.adminId, "site_setting.save_logo", { logoType: parsed.data.logoType });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: "Logo tersimpan." };
}

const trendingModeSchema = z.object({ trendingMode: z.enum(["manual", "auto"]) });

export async function saveTrendingMode(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = trendingModeSchema.safeParse({ trendingMode: formData.get("trendingMode") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.siteSetting.upsert({
    where: { key: "trending_mode" },
    update: { value: parsed.data.trendingMode },
    create: { key: "trending_mode", value: parsed.data.trendingMode },
  });
  await logAdmin(admin.adminId, "site_setting.save_trending_mode", { trendingMode: parsed.data.trendingMode });
  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { ok: "Mode trending tersimpan." };
}

export async function uploadFaviconFile(formData: FormData): Promise<{ url?: string; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "File tidak ditemukan." };
  return uploadToBlob("site-settings", `favicon-${Date.now()}`, file, ALLOWED_LOGO_TYPES);
}

const faviconSchema = z.object({ faviconUrl: z.string().url("URL favicon tidak valid") });

export async function saveFavicon(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = faviconSchema.safeParse({ faviconUrl: formData.get("faviconUrl") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.siteSetting.upsert({
    where: { key: "favicon_url" },
    update: { value: parsed.data.faviconUrl },
    create: { key: "favicon_url", value: parsed.data.faviconUrl },
  });
  await logAdmin(admin.adminId, "site_setting.save_favicon");
  revalidatePath("/admin/settings");
  return { ok: "Favicon tersimpan. Mungkin perlu hard-refresh browser untuk melihat perubahan (favicon di-cache agresif oleh browser)." };
}

const faqItemsSchema = z
  .array(z.object({ q: z.string().min(1, "Pertanyaan wajib diisi"), a: z.string().min(1, "Jawaban wajib diisi") }))
  .max(50, "Maksimal 50 pertanyaan");

export async function saveFaqItems(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const raw = formData.get("items");
  if (typeof raw !== "string") return { error: "Data FAQ tidak valid." };
  let items: unknown;
  try {
    items = JSON.parse(raw);
  } catch {
    return { error: "Data FAQ tidak valid." };
  }
  const parsed = faqItemsSchema.safeParse(items);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.siteSetting.upsert({
    where: { key: "faq_items" },
    update: { value: JSON.stringify(parsed.data) },
    create: { key: "faq_items", value: JSON.stringify(parsed.data) },
  });
  await logAdmin(admin.adminId, "site_setting.save_faq_items", { count: parsed.data.length });
  revalidatePath("/admin/settings");
  revalidatePath("/faq");
  return { ok: "FAQ tersimpan." };
}

const contentPageSchema = z.object({ content: z.string().min(1, "Konten tidak boleh kosong") });

export async function saveTosContent(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = contentPageSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.siteSetting.upsert({
    where: { key: "tos_content" },
    update: { value: parsed.data.content },
    create: { key: "tos_content", value: parsed.data.content },
  });
  await logAdmin(admin.adminId, "site_setting.save_tos_content");
  revalidatePath("/admin/settings");
  revalidatePath("/syarat-ketentuan");
  return { ok: "Syarat & Ketentuan tersimpan." };
}

export async function savePrivacyContent(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = contentPageSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.siteSetting.upsert({
    where: { key: "privacy_content" },
    update: { value: parsed.data.content },
    create: { key: "privacy_content", value: parsed.data.content },
  });
  await logAdmin(admin.adminId, "site_setting.save_privacy_content");
  revalidatePath("/admin/settings");
  revalidatePath("/kebijakan-privasi");
  return { ok: "Kebijakan Privasi tersimpan." };
}

const maintenanceModeSchema = z.object({
  maintenanceMode: z.enum(["on", "off"]),
  maintenanceMessage: z.string().min(1, "Pesan maintenance wajib diisi"),
});

export async function saveMaintenanceMode(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = maintenanceModeSchema.safeParse({
    maintenanceMode: formData.get("maintenanceMode") === "on" ? "on" : "off",
    maintenanceMessage: formData.get("maintenanceMessage"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.$transaction([
    db.siteSetting.upsert({
      where: { key: "maintenance_mode" },
      update: { value: parsed.data.maintenanceMode },
      create: { key: "maintenance_mode", value: parsed.data.maintenanceMode },
    }),
    db.siteSetting.upsert({
      where: { key: "maintenance_message" },
      update: { value: parsed.data.maintenanceMessage },
      create: { key: "maintenance_message", value: parsed.data.maintenanceMessage },
    }),
  ]);
  // targetType/detail dicatat eksplisit - ini toggle yang mematikan seluruh
  // storefront publik, harus gampang dilacak siapa & kapan di AdminActionLog.
  await logAdmin(admin.adminId, "site_setting.save_maintenance_mode", { maintenanceMode: parsed.data.maintenanceMode });
  revalidatePath("/admin/settings");
  return { ok: parsed.data.maintenanceMode === "on" ? "Maintenance mode DIAKTIFKAN. Storefront publik sekarang tertutup." : "Maintenance mode dimatikan. Storefront publik sudah normal lagi." };
}
