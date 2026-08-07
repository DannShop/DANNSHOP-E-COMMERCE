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

export interface MidtransConfig {
  serverKey: string;
  merchantId: string;
  isProduction: boolean;
}

const KEY = "midtrans_config";

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
    const config = decryptJson<MidtransConfig>(row.value);
    // Row ada tapi key-nya kosong dianggap belum terkonfigurasi - jatuh ke env
    // supaya situs yang sedang jalan tidak mendadak mati kalau ada row korup.
    if (!config.serverKey) return envCreds;
    return { serverKey: config.serverKey, isProduction: config.isProduction };
  } catch (e) {
    console.error("getMidtransCreds: gagal decrypt, fallback ke env", e instanceof Error ? e.message : String(e));
    return envCreds;
  }
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
    return decryptJson<MidtransConfig>(row.value);
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
    };
  }

  return { configured: false, source: "none", isProduction: false, serverKeyMasked: null, merchantId: null };
}
