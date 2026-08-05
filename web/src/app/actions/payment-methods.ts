import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { z } from "zod";

export type ActionResult = { ok?: string; error?: string };

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

// Catatan: requireAdmin/logAdmin didefinisikan lokal (bukan diimpor dari
// actions/catalog.ts atau file actions/* lain) — pola yang sama di seluruh
// file actions/* (catalog.ts, providers.ts, orders.ts) karena tiap file
// ber-directive "use server" per-fungsi tidak bisa mengekspor helper biasa
// untuk diimpor lintas file. Lihat catalog.ts:26-32 untuk penjelasan lengkap.

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
    data: { adminId, action, targetType: "payment_method", targetId, detail },
  });
}

export async function uploadPaymentMethodLogo(formData: FormData): Promise<{ url?: string; error?: string }> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "File tidak ditemukan." };
  const code = formData.get("code");
  const prefix = typeof code === "string" && code ? code : `logo-${Date.now()}`;
  return uploadToBlob("payment-method-logos", prefix, file, ALLOWED_LOGO_TYPES);
}

const updateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Label wajib diisi"),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
  feeFlat: z.coerce.bigint().min(0n, "Fee flat tidak boleh negatif"),
  feePercent: z.coerce.number().int().min(0, "Fee persen tidak boleh negatif"),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.string().optional(),
});

export async function updatePaymentMethod(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    logoUrl: formData.get("logoUrl"),
    feeFlat: formData.get("feeFlat"),
    feePercent: formData.get("feePercent"),
    sortOrder: formData.get("sortOrder") ?? 0,
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.paymentMethodConfig.update({
    where: { id: parsed.data.id },
    data: {
      label: parsed.data.label,
      logoUrl: parsed.data.logoUrl,
      feeFlat: parsed.data.feeFlat,
      feePercent: parsed.data.feePercent,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive === "on",
    },
  });
  await logAdmin(admin.adminId, "payment_method.update", parsed.data.id, {
    feeFlat: parsed.data.feeFlat.toString(),
    feePercent: parsed.data.feePercent,
    isActive: parsed.data.isActive === "on",
  });
  revalidatePath("/admin/payment-methods");
  return { ok: "Metode pembayaran tersimpan." };
}
