import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { uploadToBlob } from "@/lib/blob-upload";
import { saveEmailProviderConfig } from "@/lib/notify/email-config";
import {
  getTelegramNotifyConfig,
  saveTelegramNotifyConfig,
  TELEGRAM_EVENT_KEYS,
  type TelegramEvent,
} from "@/lib/notify/telegram-config";
import { sendTelegramAlert } from "@/lib/notify/telegram";
import { changeUserPassword } from "@/lib/account/change-password";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth/admin-gate";

export type ActionResult = { ok?: string; error?: string };

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
]);

// Favicon TIDAK boleh menerima video - browser tidak bisa merender video
// sebagai ikon tab, jadi mengizinkannya cuma bikin admin bisa "berhasil"
// upload sesuatu yang tidak akan pernah tampil di mana pun.
const ALLOWED_FAVICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

const requireAdmin = () => requireAdminSession("storefront.manage");

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
  return uploadToBlob("site-settings", `favicon-${Date.now()}`, file, ALLOWED_FAVICON_TYPES);
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

const contactSettingsSchema = z.object({
  whatsappCs: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/[^0-9]/g, "")),
  telegramCs: z
    .string()
    .optional()
    .transform((v) => (v ?? "").replace(/^@/, "").trim()),
  csHours: z.string().optional().transform((v) => (v ?? "").trim()),
});

export async function saveContactSettings(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = contactSettingsSchema.safeParse({
    whatsappCs: formData.get("whatsappCs"),
    telegramCs: formData.get("telegramCs"),
    csHours: formData.get("csHours"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.$transaction([
    db.siteSetting.upsert({
      where: { key: "whatsapp_cs" },
      update: { value: parsed.data.whatsappCs },
      create: { key: "whatsapp_cs", value: parsed.data.whatsappCs },
    }),
    db.siteSetting.upsert({
      where: { key: "telegram_cs" },
      update: { value: parsed.data.telegramCs },
      create: { key: "telegram_cs", value: parsed.data.telegramCs },
    }),
    db.siteSetting.upsert({
      where: { key: "cs_hours" },
      update: { value: parsed.data.csHours },
      create: { key: "cs_hours", value: parsed.data.csHours },
    }),
  ]);
  await logAdmin(admin.adminId, "site_setting.save_contact");
  revalidatePath("/admin/settings");
  revalidatePath("/kontak");
  return { ok: "Kontak CS tersimpan." };
}

const emailConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("resend"),
    apiKey: z.string().min(1, "API key Resend wajib diisi"),
    fromEmail: z.string().min(1, "Alamat pengirim wajib diisi"),
  }),
  z.object({
    kind: z.literal("smtp"),
    host: z.string().min(1, "Host SMTP wajib diisi"),
    port: z.coerce.number().int().min(1).max(65535),
    // .nullish(): checkbox tak tercentang mengirim `null`, dan .optional() Zod
    // cuma menerima `undefined` - lihat catatan lengkap di actions/payment-config.ts.
    secure: z.string().nullish().transform((v) => v === "on"),
    user: z.string().min(1, "User SMTP wajib diisi"),
    password: z.string().min(1, "Password SMTP wajib diisi"),
    fromEmail: z.string().min(1, "Alamat pengirim wajib diisi"),
  }),
]);

// Kredensial (apiKey/password) tidak pernah masuk log admin - cuma "kind"
// yang dicatat, sama pola seperti saveDigiflazzCredentials.
export async function saveEmailConfig(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const kind = formData.get("kind") === "smtp" ? "smtp" : "resend";
  const parsed = emailConfigSchema.safeParse(
    kind === "smtp"
      ? {
          kind: "smtp",
          host: formData.get("host"),
          port: formData.get("port"),
          secure: formData.get("secure"),
          user: formData.get("user"),
          password: formData.get("password"),
          fromEmail: formData.get("fromEmail"),
        }
      : {
          kind: "resend",
          apiKey: formData.get("apiKey"),
          fromEmail: formData.get("fromEmail"),
        },
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await saveEmailProviderConfig(parsed.data);
  await logAdmin(admin.adminId, "site_setting.save_email_config", { kind: parsed.data.kind });
  revalidatePath("/admin/settings");
  return { ok: "Konfigurasi email tersimpan." };
}

const telegramConfigSchema = z.object({
  // Boleh kosong KALAU sudah pernah tersimpan - form tidak pernah menampilkan
  // token lama, jadi memaksa mengisinya tiap kali menyimpan berarti admin harus
  // mencari ulang token cuma untuk mengubah satu centang event.
  botToken: z.string().optional().transform((v) => (v ?? "").trim()),
  chatId: z.string().optional().transform((v) => (v ?? "").trim()),
  enabled: z.string().nullish().transform((v) => v === "on"),
});

export async function saveTelegramConfig(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = telegramConfigSchema.safeParse({
    botToken: formData.get("botToken"),
    chatId: formData.get("chatId"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await getTelegramNotifyConfig();
  const botToken = parsed.data.botToken || existing?.botToken || "";
  const chatId = parsed.data.chatId || existing?.chatId || "";
  if (!botToken) return { error: "Bot token wajib diisi." };
  if (!chatId) return { error: "Chat ID wajib diisi." };

  const events = Object.fromEntries(
    TELEGRAM_EVENT_KEYS.map((e) => [e, formData.get(`event.${e}`) === "on"]),
  ) as Record<TelegramEvent, boolean>;

  await saveTelegramNotifyConfig({ botToken, chatId, enabled: parsed.data.enabled, events });
  // Token TIDAK pernah masuk log admin - pola sama dengan saveEmailConfig.
  await logAdmin(admin.adminId, "site_setting.save_telegram_config", {
    enabled: parsed.data.enabled,
    aktif: TELEGRAM_EVENT_KEYS.filter((e) => events[e]),
  });
  revalidatePath("/admin/settings");
  return { ok: "Konfigurasi notifikasi Telegram tersimpan." };
}

// Mengirim pesan uji ke chat yang dikonfigurasi. Sengaja memakai
// sendTelegramAlert (bukan notifyTelegram): tes harus tetap terkirim walau
// saklar induk sedang mati - justru itu cara admin memastikan tokennya benar
// SEBELUM menyalakannya.
export async function sendTelegramTest(): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const config = await getTelegramNotifyConfig();
  if (!config) return { error: "Bot token/chat ID belum diisi. Simpan konfigurasinya dulu." };

  const sent = await sendTelegramAlert(
    `🔔 Tes notifikasi DannShop berhasil.\nKalau pesan ini sampai, notifikasi admin sudah tersambung dengan benar.\nWaktu: ${new Date().toLocaleString("id-ID")}`,
    config,
  );
  await logAdmin(admin.adminId, "site_setting.telegram_test", { sent });
  return sent
    ? { ok: "Pesan tes terkirim. Cek chat Telegram-mu." }
    : {
        error:
          "Gagal mengirim. Cek: (1) token benar, (2) chat ID benar, (3) bot sudah pernah di-/start atau sudah dimasukkan ke grup tujuan. Detail teknis ada di log runtime.",
      };
}

// Gate requireAdmin sengaja dijalankan SEBELUM password diubah - sesudahnya
// User.updatedAt sudah naik, jadi sesi yang sama pasti dianggap basi. Form di
// client yang melogout admin setelah sukses.
export async function changeAdminPassword(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const result = await changeUserPassword(admin.adminId, formData);
  if (!result.ok) return result;

  // Nilai password TIDAK pernah masuk log - cuma jejak "siapa & kapan".
  await logAdmin(admin.adminId, "change_password", {});
  revalidatePath("/admin/settings");
  return result;
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
