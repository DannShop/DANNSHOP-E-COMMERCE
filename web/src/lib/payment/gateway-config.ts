import { db } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/crypto";
import type { MidtransCreds } from "@/lib/midtrans/client";

// Kredensial Midtrans - disimpan terenkripsi (AES-256-GCM, pola persis
// lib/notify/email-config.ts dan ProviderConfig.credentials) di SiteSetting,
// bukan tabel baru. Ini SATU-SATUNYA sumber kredensial Midtrans di seluruh
// aplikasi: lib/midtrans/client.ts sengaja tidak lagi punya default
// process.env, supaya tidak ada jalur diam-diam yang bisa memakai key berbeda
// dari yang dipasang admin di panel.
//
// Client key SENGAJA tidak ada di sini. Core API (yang dipakai aplikasi ini)
// tidak memerlukannya sama sekali - NEXT_PUBLIC_MIDTRANS_CLIENT_KEY adalah
// sisa peninggalan Snap sebelum migrasi ke Core API dan nol dipakai di src/.
// Menyediakan field yang tidak berefek apa-apa cuma menyesatkan admin.

// "core_api" = charge langsung, pembayaran inline di situs kita (jalur utama).
// "snap"     = fallback: Midtrans menerbitkan token, popup Snap.js yang
//              menampilkan halaman pembayarannya di atas halaman kita.
//
// Fallback ini ada karena Core API PRODUCTION adalah layanan yang harus
// diaktifkan terpisah oleh Midtrans (di sandbox aktif otomatis, di production
// TIDAK - lihat docs/07-AKTIVASI-CORE-API-MIDTRANS.md). Selama pengajuan
// aktivasi belum disetujui, seluruh charge Core API dibalas 402 "Payment
// channel is not activated." padahal Snap di akun yang sama jalan normal.
// Toggle ini yang membuat situs tetap bisa menerima uang selama masa tunggu,
// dan mengembalikannya nanti cukup sekali klik - tanpa deploy.
export type MidtransIntegrationMode = "core_api" | "snap";

export interface MidtransConfig {
  serverKey: string;
  // HANYA dipakai mode Snap (popup Snap.js wajib diberi client key di browser).
  // Core API tidak memerlukannya sama sekali - dulu field ini memang sudah
  // dihapus dari sini, dan sengaja dihidupkan lagi HANYA karena Snap.
  clientKey: string;
  merchantId: string;
  isProduction: boolean;
  integrationMode: MidtransIntegrationMode;
}

const KEY = "midtrans_config";

// Konfigurasi yang tersimpan SEBELUM fitur Snap ada tidak punya kedua field
// baru. Dinormalkan di satu tempat supaya tidak ada pembaca yang kebagian
// `undefined` - default "core_api" = persis perilaku lama.
function normalize(config: Partial<MidtransConfig>): MidtransConfig {
  return {
    serverKey: config.serverKey ?? "",
    clientKey: config.clientKey ?? "",
    merchantId: config.merchantId ?? "",
    isProduction: config.isProduction ?? false,
    integrationMode: config.integrationMode === "snap" ? "snap" : "core_api",
  };
}

// Mengembalikan server key ASLI (sudah didecrypt). Hanya boleh dipanggil dari
// server action / route handler yang langsung memakainya untuk memanggil
// Midtrans - JANGAN pernah hasilnya dikembalikan ke browser. Untuk kebutuhan
// menampilkan status di panel admin, pakai getMidtransConfigStatus().
export async function getMidtransCreds(): Promise<MidtransCreds> {
  const envCreds: MidtransCreds = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  };

  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return envCreds;

  try {
    const config = normalize(decryptJson<Partial<MidtransConfig>>(row.value));
    // Row ada tapi key-nya kosong dianggap belum terkonfigurasi - jatuh ke env
    // supaya situs yang sedang jalan tidak mendadak mati kalau ada row korup.
    if (!config.serverKey) return envCreds;
    return { serverKey: config.serverKey, isProduction: config.isProduction };
  } catch (e) {
    console.error("getMidtransCreds: gagal decrypt, fallback ke env", e instanceof Error ? e.message : String(e));
    return envCreds;
  }
}

export interface MidtransRuntime {
  creds: MidtransCreds;
  mode: MidtransIntegrationMode;
  /** Kosong kalau belum diisi admin. Hanya berarti di mode Snap. */
  clientKey: string;
}

// Satu-satunya pembaca konfigurasi untuk ALUR PEMBUATAN PEMBAYARAN. Dipakai
// lib/payment/create-payment.ts; jalur lain (status/settlement) cukup
// getMidtransCreds() karena mode integrasi tidak mengubah cara membaca status -
// Snap maupun Core API sama-sama memakai order_id yang sama di endpoint
// /v2/{order_id}/status dan webhook yang sama.
export async function getMidtransRuntime(): Promise<MidtransRuntime> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) {
    return {
      creds: {
        serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      },
      mode: "core_api",
      clientKey: "",
    };
  }
  try {
    const config = normalize(decryptJson<Partial<MidtransConfig>>(row.value));
    if (!config.serverKey) {
      return {
        creds: {
          serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
          isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
        },
        mode: "core_api",
        clientKey: "",
      };
    }
    return {
      creds: { serverKey: config.serverKey, isProduction: config.isProduction },
      mode: config.integrationMode,
      clientKey: config.clientKey,
    };
  } catch {
    return {
      creds: {
        serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      },
      mode: "core_api",
      clientKey: "",
    };
  }
}

export interface SnapBrowserConfig {
  clientKey: string;
  /** URL Snap.js sesuai environment - sandbox dan production BEDA host. */
  scriptUrl: string;
}

// Dipanggil HANYA saat halaman invoice/deposit benar-benar punya pembayaran
// mode Snap, supaya halaman Core API tidak kena baca konfigurasi percuma.
// Client key memang dirancang untuk publik (tertanam di halaman oleh Snap),
// jadi aman dikirim ke browser - berbeda dari server key.
export async function getSnapBrowserConfig(): Promise<SnapBrowserConfig | null> {
  const { creds, clientKey } = await getMidtransRuntime();
  if (!clientKey) return null;
  return {
    clientKey,
    scriptUrl: creds.isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js",
  };
}

export async function saveMidtransConfig(config: MidtransConfig): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: encryptJson(config) },
    create: { key: KEY, value: encryptJson(config) },
  });
}

// Dipakai server action "simpan" supaya admin bisa mengubah HANYA mode
// sandbox/production tanpa harus mengetik ulang server key yang sudah
// tersimpan (field key dikosongkan = tidak mengubah yang tersimpan).
export async function getStoredMidtransConfig(): Promise<MidtransConfig | null> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    return normalize(decryptJson<Partial<MidtransConfig>>(row.value));
  } catch {
    return null;
  }
}

export interface MidtransConfigStatus {
  configured: boolean;
  /** Dari mana kredensial yang AKTIF sekarang diambil. */
  source: "db" | "env" | "none";
  isProduction: boolean;
  /** Hanya 4 karakter terakhir - server key asli tidak pernah dikirim ke browser. */
  serverKeyMasked: string | null;
  merchantId: string | null;
  integrationMode: MidtransIntegrationMode;
  /** Client key AMAN ditampilkan (memang dipublikasikan ke browser oleh Snap). */
  clientKey: string;
}

function mask(serverKey: string): string {
  if (serverKey.length <= 4) return "••••";
  return `••••${serverKey.slice(-4)}`;
}

// Aman ditampilkan ke admin - tidak pernah membawa server key asli.
export async function getMidtransConfigStatus(): Promise<MidtransConfigStatus> {
  const stored = await getStoredMidtransConfig();
  if (stored?.serverKey) {
    return {
      configured: true,
      source: "db",
      isProduction: stored.isProduction,
      serverKeyMasked: mask(stored.serverKey),
      merchantId: stored.merchantId || null,
      integrationMode: stored.integrationMode,
      clientKey: stored.clientKey,
    };
  }

  const envKey = process.env.MIDTRANS_SERVER_KEY;
  if (envKey) {
    return {
      configured: true,
      source: "env",
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKeyMasked: mask(envKey),
      merchantId: null,
      integrationMode: "core_api",
      clientKey: "",
    };
  }

  return {
    configured: false,
    source: "none",
    isProduction: false,
    serverKeyMasked: null,
    merchantId: null,
    integrationMode: "core_api",
    clientKey: "",
  };
}
