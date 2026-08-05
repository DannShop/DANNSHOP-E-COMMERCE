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
