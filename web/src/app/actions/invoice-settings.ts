"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { getInvoiceBranding, saveInvoiceBranding, sanitizeHexColor } from "@/lib/invoice/branding";
import { getManualOrderSettings, saveManualOrderSettings } from "@/lib/invoice/manual-order";
import {
  EMAIL_TEMPLATE_KEYS,
  defaultTemplate,
  saveEmailTemplate,
  type EmailTemplateKey,
} from "@/lib/notify/email-templates";
import { renderEmailPreview } from "@/lib/notify/email";

export type ActionResult = { ok?: string; error?: string };

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

// Disalin dari actions/settings.ts mengikuti pola file action lain di repo ini
// (sepuluh file punya salinannya masing-masing) - bukan diekstrak, supaya
// perubahan ini tidak menyentuh sepuluh file yang tidak ada hubungannya.
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
  await db.adminActionLog.create({ data: { adminId, action, targetType: "site_setting", detail } });
}

// ===== Branding dokumen =====

export async function uploadInvoiceLogo(formData: FormData): Promise<{ url?: string; error?: string }> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "File tidak ditemukan." };
  return uploadToBlob("invoice", `logo-${Date.now()}`, file, ALLOWED_LOGO_TYPES);
}

const brandingSchema = z.object({
  brandName: z.string().min(1, "Nama brand wajib diisi").max(60, "Nama brand maksimal 60 karakter"),
  logoUrl: z.string().optional().transform((v) => (v ?? "").trim()),
  accentColor: z.string().optional(),
  tagline: z.string().max(120, "Tagline maksimal 120 karakter").optional().transform((v) => (v ?? "").trim()),
  addressLine: z.string().max(400).optional().transform((v) => (v ?? "").trim()),
  supportLine: z.string().max(400).optional().transform((v) => (v ?? "").trim()),
  footerText: z.string().max(400).optional().transform((v) => (v ?? "").trim()),
  // .nullish(): checkbox tak tercentang mengirim `null`, dan .optional() Zod
  // cuma menerima `undefined` - lihat catatan lengkap di actions/payment-config.ts.
  showQrOnReceipt: z.string().nullish().transform((v) => v === "on"),
  defaultPaperSize: z.enum(["58", "80", "a4"]),
});

export async function saveBranding(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = brandingSchema.safeParse({
    brandName: formData.get("brandName"),
    logoUrl: formData.get("logoUrl"),
    accentColor: formData.get("accentColor"),
    tagline: formData.get("tagline"),
    addressLine: formData.get("addressLine"),
    supportLine: formData.get("supportLine"),
    footerText: formData.get("footerText"),
    showQrOnReceipt: formData.get("showQrOnReceipt"),
    defaultPaperSize: formData.get("defaultPaperSize") ?? "58",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveInvoiceBranding({
    brandName: parsed.data.brandName,
    logoUrl: parsed.data.logoUrl || null,
    // Divalidasi ulang di sini, bukan cuma diandalkan pada <input type="color">:
    // form bisa dikirim tanpa browser, dan nilainya berakhir di atribut style.
    accentColor: sanitizeHexColor(parsed.data.accentColor, "#7C3AED"),
    tagline: parsed.data.tagline,
    addressLine: parsed.data.addressLine,
    supportLine: parsed.data.supportLine,
    footerText: parsed.data.footerText,
    showQrOnReceipt: parsed.data.showQrOnReceipt,
    defaultPaperSize: parsed.data.defaultPaperSize,
  });
  await logAdmin(admin.adminId, "invoice.save_branding", { brandName: parsed.data.brandName });
  revalidatePath("/admin/invoice");
  return { ok: "Identitas dokumen tersimpan. Berlaku untuk email, invoice, dan struk." };
}

// ===== Template email =====

const emailTemplateSchema = z.object({
  key: z.enum(EMAIL_TEMPLATE_KEYS),
  subject: z.string().min(1, "Subjek wajib diisi").max(200, "Subjek maksimal 200 karakter"),
  body: z.string().min(1, "Isi email wajib diisi").max(20_000, "Isi email terlalu panjang"),
});

export async function saveEmailTemplateAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = emailTemplateSchema.safeParse({
    key: formData.get("key"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveEmailTemplate(parsed.data.key, { subject: parsed.data.subject, body: parsed.data.body });
  await logAdmin(admin.adminId, "invoice.save_email_template", { template: parsed.data.key });
  revalidatePath("/admin/invoice");
  return { ok: "Template email tersimpan." };
}

export async function resetEmailTemplateAction(key: EmailTemplateKey): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  if (!EMAIL_TEMPLATE_KEYS.includes(key)) return { error: "Template tidak dikenal." };

  await saveEmailTemplate(key, defaultTemplate(key));
  await logAdmin(admin.adminId, "invoice.reset_email_template", { template: key });
  revalidatePath("/admin/invoice");
  return { ok: "Template dikembalikan ke bawaan." };
}

// Merender pratinjau dari isi editor yang BELUM disimpan - admin bisa melihat
// hasilnya sebelum satu pun pelanggan menerimanya. Dikembalikan sebagai string
// HTML yang ditampilkan klien di dalam <iframe srcdoc> bersandbox, bukan
// disuntikkan ke DOM panel admin.
export async function previewEmailTemplateAction(
  key: EmailTemplateKey,
  subject: string,
  body: string,
): Promise<{ html?: string; error?: string }> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;
  if (!EMAIL_TEMPLATE_KEYS.includes(key)) return { error: "Template tidak dikenal." };
  void subject;
  try {
    return { html: await renderEmailPreview(key, { subject, body }) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Gagal membuat pratinjau." };
  }
}

// ===== Konfirmasi order manual =====

const manualOrderSchema = z.object({
  channel: z.enum(["whatsapp", "telegram", "both"]),
  whatsappNumber: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/[^0-9]/g, "")),
  telegramUsername: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/^@/, "").trim()),
  invoiceNote: z.string().max(500, "Keterangan maksimal 500 karakter").optional().transform((v) => (v ?? "").trim()),
  messageTemplate: z.string().min(1, "Template pesan wajib diisi").max(2000, "Template pesan terlalu panjang"),
});

export async function saveManualOrderSettingsAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = manualOrderSchema.safeParse({
    channel: formData.get("channel") ?? "whatsapp",
    whatsappNumber: formData.get("whatsappNumber"),
    telegramUsername: formData.get("telegramUsername"),
    invoiceNote: formData.get("invoiceNote"),
    messageTemplate: formData.get("messageTemplate"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Kanal yang dipilih tapi tujuannya kosong berarti pembeli melihat tombol
  // yang tidak pernah muncul (invoice menyembunyikannya) - lebih baik ditolak
  // di sini daripada baru ketahuan dari keluhan pembeli yang terjebak.
  const wantsWa = parsed.data.channel === "whatsapp" || parsed.data.channel === "both";
  const wantsTg = parsed.data.channel === "telegram" || parsed.data.channel === "both";
  const existing = await getManualOrderSettings();
  const whatsappNumber = parsed.data.whatsappNumber || existing.whatsappNumber;
  const telegramUsername = parsed.data.telegramUsername || existing.telegramUsername;
  if (wantsWa && !whatsappNumber) return { error: "Nomor WhatsApp wajib diisi untuk kanal yang dipilih." };
  if (wantsTg && !telegramUsername) return { error: "Username Telegram wajib diisi untuk kanal yang dipilih." };

  await saveManualOrderSettings({
    channel: parsed.data.channel,
    whatsappNumber,
    telegramUsername,
    invoiceNote: parsed.data.invoiceNote,
    messageTemplate: parsed.data.messageTemplate,
  });
  await logAdmin(admin.adminId, "invoice.save_manual_order", { channel: parsed.data.channel });
  revalidatePath("/admin/invoice");
  return { ok: "Pengaturan konfirmasi order manual tersimpan." };
}

// Dipakai halaman admin untuk menampilkan ringkasan tanpa menarik ulang
// seluruh pengaturan di tiap komponen anak.
export async function readInvoiceSettings() {
  const [branding, manual] = await Promise.all([getInvoiceBranding(), getManualOrderSettings()]);
  return { branding, manual };
}
