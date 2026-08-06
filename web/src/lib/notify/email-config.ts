import { db } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/crypto";

// Kredensial email (API key Resend, atau host/user/password SMTP) - disimpan
// terenkripsi (AES-256-GCM, sama persis pola ProviderConfig.credentials di
// lib/crypto.ts) di SiteSetting, bukan Json biasa. Reuse token yang sudah
// established, bukan tabel/skema baru, konsisten dengan seluruh fitur admin
// sesi ini yang sengaja nol migrasi.

export interface ResendEmailConfig {
  kind: "resend";
  apiKey: string;
  fromEmail: string;
}

export interface SmtpEmailConfig {
  kind: "smtp";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
}

export type EmailProviderConfig = ResendEmailConfig | SmtpEmailConfig;

const KEY = "email_provider_config";

// Hanya dipanggil dari lib/notify/email.ts (pengirim asli) - JANGAN pernah
// dipanggil dari komponen/action yang mengembalikan hasilnya ke browser,
// karena ini mengembalikan API key/password dalam bentuk asli (sudah didecrypt).
export async function getEmailProviderConfig(): Promise<EmailProviderConfig | null> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    return decryptJson<EmailProviderConfig>(row.value);
  } catch (e) {
    console.error("getEmailProviderConfig: gagal decrypt", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function saveEmailProviderConfig(config: EmailProviderConfig): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: encryptJson(config) },
    create: { key: KEY, value: encryptJson(config) },
  });
}

export interface EmailProviderStatus {
  configured: boolean;
  kind: "resend" | "smtp" | null;
  fromEmail: string | null;
}

// Aman ditampilkan ke admin - TIDAK pernah membawa apiKey/password asli,
// cuma status "sudah diisi atau belum" + alamat pengirim (bukan rahasia).
export async function getEmailProviderStatus(): Promise<EmailProviderStatus> {
  const config = await getEmailProviderConfig();
  if (!config) return { configured: false, kind: null, fromEmail: null };
  return { configured: true, kind: config.kind, fromEmail: config.fromEmail };
}
