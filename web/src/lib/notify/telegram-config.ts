import { db } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/crypto";

// Konfigurasi bot notifikasi Telegram admin - disimpan terenkripsi (AES-256-GCM)
// di SiteSetting, pola sama persis dengan lib/notify/email-config.ts.
//
// PENTING - ini BUKAN kontak CS. Kontak CS (SiteSetting "telegram_cs") adalah
// username Telegram manusia asli yang dipajang ke pembeli di halaman Kontak;
// yang di sini adalah bot yang mengirim notifikasi internal ke admin. Keduanya
// sengaja terpisah total: mengisi salah satunya tidak boleh berefek ke yang lain.
//
// Sebelumnya token dibaca dari env (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) dan
// kalau kosong pengiriman dilewati dengan console.error saja - artinya di
// deployment yang env-nya belum diisi, SELURUH notifikasi (order gagal, refund,
// saldo provider habis) hilang tanpa satu pun tanda yang terlihat admin.
// Env tetap dipakai sebagai fallback supaya deployment lama tidak mendadak
// bisu saat rilis ini naik, tapi sumber kebenaran barunya adalah DB.

export const TELEGRAM_EVENTS = {
  order_created: "Order baru dibuat (belum dibayar)",
  order_paid: "Pembayaran order diterima",
  order_success: "Order berhasil terkirim",
  order_failed: "Order gagal / dana dikembalikan",
  order_needs_review: "Order butuh ditinjau manual",
  order_manual: "Order manual masuk (perlu dikirim admin)",
  deposit_paid: "Deposit saldo member masuk",
  user_registered: "User baru mendaftar",
  provider_balance: "Saldo provider menipis / pulih",
  system_anomaly: "Anomali sistem & settlement",
} as const;

export type TelegramEvent = keyof typeof TELEGRAM_EVENTS;

export const TELEGRAM_EVENT_KEYS = Object.keys(TELEGRAM_EVENTS) as TelegramEvent[];

// Event yang defaultnya MENYALA saat admin belum pernah menyimpan apa pun.
// Sengaja bukan "semua nyala": order_created & order_paid ikut terkirim untuk
// tiap transaksi yang lewat, jadi di toko yang ramai itu membanjiri chat dan
// justru membuat alert yang penting (gagal/refund) ikut terabaikan.
const DEFAULT_ENABLED_EVENTS: TelegramEvent[] = [
  "order_success",
  "order_failed",
  "order_needs_review",
  "order_manual",
  "deposit_paid",
  "provider_balance",
  "system_anomaly",
];

export interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

export interface TelegramNotifyConfig extends TelegramCredentials {
  /** Saklar induk. Mati = tidak ada notifikasi apa pun, apa pun isi `events`. */
  enabled: boolean;
  events: Record<TelegramEvent, boolean>;
}

const KEY = "telegram_notify_config";

function defaultEvents(value: boolean | ((e: TelegramEvent) => boolean)): Record<TelegramEvent, boolean> {
  const resolve = typeof value === "function" ? value : () => value;
  return Object.fromEntries(TELEGRAM_EVENT_KEYS.map((e) => [e, resolve(e)])) as Record<TelegramEvent, boolean>;
}

// Melengkapi konfigurasi tersimpan dengan event yang belum ada key-nya.
// Tanpa ini, event baru yang ditambahkan ke TELEGRAM_EVENTS di rilis berikutnya
// akan terbaca `undefined` (= mati) di semua deployment yang sudah pernah
// menyimpan konfigurasi, dan admin tidak akan pernah tahu kenapa notifikasi
// barunya tidak muncul.
function normalizeEvents(stored: unknown): Record<TelegramEvent, boolean> {
  const map = (stored ?? {}) as Record<string, unknown>;
  return defaultEvents((e) =>
    typeof map[e] === "boolean" ? (map[e] as boolean) : DEFAULT_ENABLED_EVENTS.includes(e),
  );
}

function configFromEnv(): TelegramNotifyConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  if (!botToken || !chatId) return null;
  return {
    botToken,
    chatId,
    enabled: true,
    events: defaultEvents((e) => DEFAULT_ENABLED_EVENTS.includes(e)),
  };
}

// Mengembalikan botToken ASLI - jangan pernah dipanggil dari komponen/action
// yang hasilnya dikirim balik ke browser. Pakai getTelegramNotifyStatus().
export async function getTelegramNotifyConfig(): Promise<TelegramNotifyConfig | null> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return configFromEnv();
  try {
    const parsed = decryptJson<Partial<TelegramNotifyConfig>>(row.value);
    if (!parsed.botToken || !parsed.chatId) return configFromEnv();
    return {
      botToken: parsed.botToken,
      chatId: parsed.chatId,
      enabled: parsed.enabled !== false,
      events: normalizeEvents(parsed.events),
    };
  } catch (e) {
    console.error("getTelegramNotifyConfig: gagal decrypt", e instanceof Error ? e.message : String(e));
    return configFromEnv();
  }
}

export async function saveTelegramNotifyConfig(config: TelegramNotifyConfig): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: encryptJson(config) },
    create: { key: KEY, value: encryptJson(config) },
  });
}

export interface TelegramNotifyStatus {
  configured: boolean;
  /** true kalau kredensialnya masih dari env var, belum pernah disimpan lewat panel. */
  fromEnv: boolean;
  enabled: boolean;
  chatId: string;
  events: Record<TelegramEvent, boolean>;
}

// Aman ditampilkan ke admin - TIDAK pernah membawa botToken. chatId ikut
// ditampilkan (bukan rahasia, dan admin butuh melihatnya untuk memastikan
// tujuannya benar sebelum kirim tes).
export async function getTelegramNotifyStatus(): Promise<TelegramNotifyStatus> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  const config = await getTelegramNotifyConfig();
  if (!config) {
    return {
      configured: false,
      fromEnv: false,
      enabled: false,
      chatId: "",
      events: defaultEvents((e) => DEFAULT_ENABLED_EVENTS.includes(e)),
    };
  }
  return {
    configured: true,
    fromEnv: row === null,
    enabled: config.enabled,
    chatId: config.chatId,
    events: config.events,
  };
}
