import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export type ActionResult = { ok?: string; error?: string };

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
    data: { adminId, action, targetType: "category", targetId, detail },
  });
}

const slugSchema = z
  .string()
  .min(1, "Slug wajib diisi")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug cuma boleh huruf kecil, angka, dan tanda hubung");

const createSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1, "Nama wajib diisi"),
  sortOrder: z.coerce.number().int().default(0),
});

export async function createCategory(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = createSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.category.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return { error: "Slug sudah dipakai kategori lain." };

  const category = await db.category.create({ data: parsed.data });
  await logAdmin(admin.adminId, "category.create", category.id, { slug: parsed.data.slug });
  revalidatePath("/admin/categories");
  revalidatePath("/");
  return { ok: "Kategori dibuat." };
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nama wajib diisi"),
  sortOrder: z.coerce.number().int().default(0),
});

export async function updateCategory(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.category.update({
    where: { id: parsed.data.id },
    data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder },
  });
  await logAdmin(admin.adminId, "category.update", parsed.data.id, { name: parsed.data.name });
  revalidatePath("/admin/categories");
  revalidatePath("/");
  return { ok: "Kategori tersimpan." };
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = deleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const productCount = await db.product.count({ where: { categoryId: parsed.data.id } });
  if (productCount > 0) {
    return { error: `Kategori masih punya ${productCount} produk, tidak bisa dihapus.` };
  }

  await db.category.delete({ where: { id: parsed.data.id } });
  await logAdmin(admin.adminId, "category.delete", parsed.data.id);
  revalidatePath("/admin/categories");
  revalidatePath("/");
  return { ok: "Kategori dihapus." };
}
