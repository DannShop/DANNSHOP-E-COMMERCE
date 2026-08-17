import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin-gate";

export type ActionResult = { ok?: string; error?: string };

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const requireAdmin = () => requireAdminSession("storefront.manage");

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

// Gambar desktop opsional - dibiarkan kosong berarti carousel memakai gambar
// mobile juga untuk desktop (dipotong atas-bawah, perilaku lama).
const desktopImageSchema = z
  .string()
  .url("URL gambar desktop tidak valid")
  .optional()
  .or(z.literal(""));

const createSchema = z.object({
  imageUrl: z.string().url("URL gambar tidak valid"),
  imageUrlDesktop: desktopImageSchema,
  linkUrl: z.string().url("URL tujuan tidak valid").optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().default(0),
});

export async function createBanner(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = createSchema.safeParse({
    imageUrl: formData.get("imageUrl"),
    imageUrlDesktop: formData.get("imageUrlDesktop") || "",
    linkUrl: formData.get("linkUrl") || "",
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const banner = await db.banner.create({
    data: {
      imageUrl: parsed.data.imageUrl,
      imageUrlDesktop: parsed.data.imageUrlDesktop || null,
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
  // Gambar ikut bisa diubah dari form edit - sebelumnya tidak bisa sama sekali,
  // satu-satunya cara mengganti gambar banner adalah hapus lalu buat ulang.
  // Itu jadi penghalang nyata sekarang: banner yang sudah ada perlu ditambahi
  // versi desktop TANPA harus dibuat ulang dari nol.
  imageUrl: z.string().url("URL gambar tidak valid"),
  imageUrlDesktop: desktopImageSchema,
  linkUrl: z.string().url("URL tujuan tidak valid").optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().default(0),
  // .nullish(): checkbox tak tercentang mengirim `null`, dan .optional() Zod
  // cuma menerima `undefined` - lihat catatan lengkap di actions/payment-config.ts.
  isActive: z.string().nullish(),
});

export async function updateBanner(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    imageUrl: formData.get("imageUrl"),
    imageUrlDesktop: formData.get("imageUrlDesktop") || "",
    linkUrl: formData.get("linkUrl") || "",
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.banner.update({
    where: { id: parsed.data.id },
    data: {
      imageUrl: parsed.data.imageUrl,
      imageUrlDesktop: parsed.data.imageUrlDesktop || null,
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
