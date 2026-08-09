"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SLOT_KEYS, saveStorefrontAppearance } from "@/lib/storefront/appearance";
import { sanitizeHtml } from "@/lib/storefront/sanitize-html";

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

const appearanceSchema = z.object({
  primaryColor: z.string().optional().transform((v) => (v ?? "").trim()),
  radiusPx: z.coerce.number().int().min(0, "Radius minimal 0").max(32, "Radius maksimal 32"),
  customCss: z.string().max(20_000, "CSS kustom terlalu panjang").optional().transform((v) => (v ?? "").trim()),
});

export async function saveAppearanceAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = appearanceSchema.safeParse({
    primaryColor: formData.get("primaryColor"),
    radiusPx: formData.get("radiusPx") ?? 10,
    customCss: formData.get("customCss"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slots: Record<string, string> = {};
  for (const key of SLOT_KEYS) {
    const raw = formData.get(`slot.${key}`);
    slots[key] = typeof raw === "string" ? raw.slice(0, 20_000) : "";
  }

  // Penyaringan sesungguhnya terjadi di dalam saveStorefrontAppearance -
  // sengaja di lapisan penyimpanan, bukan di action, supaya jalur penulisan
  // mana pun (termasuk yang ditambahkan nanti) tidak bisa melewatinya.
  await saveStorefrontAppearance({
    primaryColor: parsed.data.primaryColor,
    radiusPx: parsed.data.radiusPx,
    customCss: parsed.data.customCss,
    slots,
  });

  await db.adminActionLog.create({
    data: {
      adminId: admin.adminId,
      action: "appearance.save",
      targetType: "site_setting",
      detail: { slotsTerisi: SLOT_KEYS.filter((k) => (slots[k] ?? "").trim() !== "") },
    },
  });
  revalidatePath("/admin/appearance");
  revalidatePath("/", "layout");
  return { ok: "Tampilan tersimpan. Muat ulang halaman storefront untuk melihat hasilnya." };
}

/**
 * Menampilkan hasil penyaringan sebuah potongan HTML tanpa menyimpannya.
 *
 * Ini bukan sekadar pratinjau kosmetik: penyaring membuang tag & atribut di
 * luar daftar-izin, dan admin berhak tahu PERSIS apa yang akan tampil sebelum
 * bingung kenapa markupnya "tidak jalan".
 */
export async function previewSlotHtml(html: string): Promise<{ html?: string; error?: string }> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  return { html: sanitizeHtml(html) };
}
