import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { z } from "zod";

export type ActionResult = { ok?: string; error?: string };

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true, updatedAt: true } });
  if (!fresh || fresh.role !== "ADMIN" || fresh.updatedAt.getTime() !== session.user.updatedAt) {
    return { error: "Tidak diizinkan" };
  }
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "banner", targetId, detail },
  });
}

export async function uploadBannerImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "File tidak ditemukan." };
  return uploadToBlob("banners", `new-${Date.now()}`, file, ALLOWED_IMAGE_TYPES);
}

const createSchema = z.object({
  imageUrl: z.string().url("URL gambar tidak valid"),
  linkUrl: z.string().url("URL tujuan tidak valid").optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().default(0),
});

export async function createBanner(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = createSchema.safeParse({
    imageUrl: formData.get("imageUrl"),
    linkUrl: formData.get("linkUrl") || "",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const banner = await db.banner.create({
    data: {
      imageUrl: parsed.data.imageUrl,
      linkUrl: parsed.data.linkUrl || null,
      sortOrder: parsed.data.sortOrder,
    },
  });
  await logAdmin(admin.adminId, "banner.create", banner.id);
  revalidatePath("/admin/banners");
  revalidatePath("/");
  return { ok: "Banner ditambahkan." };
}

const updateSchema = z.object({
  id: z.string().min(1),
  linkUrl: z.string().url("URL tujuan tidak valid").optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.string().optional(),
});

export async function updateBanner(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    linkUrl: formData.get("linkUrl") || "",
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.banner.update({
    where: { id: parsed.data.id },
    data: {
      linkUrl: parsed.data.linkUrl || null,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive === "on",
    },
  });
  await logAdmin(admin.adminId, "banner.update", parsed.data.id);
  revalidatePath("/admin/banners");
  revalidatePath("/");
  return { ok: "Banner tersimpan." };
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteBanner(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.banner.delete({ where: { id: parsed.data.id } });
  await logAdmin(admin.adminId, "banner.delete", parsed.data.id);
  revalidatePath("/admin/banners");
  revalidatePath("/");
  return { ok: "Banner dihapus." };
}
