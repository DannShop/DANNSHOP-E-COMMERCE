import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { DigiflazzAdapter, type DigiflazzCredentials } from "./digiflazz";
import { OkeConnectAdapter, type OkeConnectCredentials } from "./okeconnect";
import { recordProviderApiCall } from "./api-log";
import type { TopupProviderAdapter } from "./types";

type DbLike = {
  providerConfig: {
    findUnique: (args: { where: { key: ProviderKey } }) => Promise<{ credentials: unknown; isActive: boolean } | null>;
    findMany: (args: { where: { isActive: boolean }; select: { key: true } }) => Promise<{ key: ProviderKey }[]>;
  };
};

// Satu-satunya jalan membuat adapter dari konfigurasi DB.
// Kredensial disimpan terenkripsi (Task 1) — didecrypt di sini, tidak pernah bocor ke client.
export async function getAdapter(
  key: ProviderKey,
  dbClient: DbLike = db as unknown as DbLike,
  options?: { allowInactive?: boolean },
): Promise<TopupProviderAdapter> {
  const config = await dbClient.providerConfig.findUnique({ where: { key } });
  if (!config) throw new Error(`Provider ${key} belum dikonfigurasi di database.`);
  // Kill-switch (isActive=false) mencegah transaksi BARU ke provider ini. Tapi cek status
  // transaksi yang SUDAH terlanjur dikirim ke provider itu operasi read-only yang tetap wajib
  // bisa jalan walau provider dinonaktifkan admin - kalau tidak, order yang customer sudah bayar
  // macet permanen di PROCESSING karena job recheck-nya ikut diblokir kill-switch. allowInactive
  // dipakai spesifik oleh jalur checkStatus (bukan createTransaction).
  if (!config.isActive && !options?.allowInactive) throw new Error(`Provider ${key} sedang dinonaktifkan.`);
  if (typeof config.credentials !== "string" || config.credentials.length === 0) {
    throw new Error(`Provider ${key} belum punya kredensial tersimpan.`);
  }

  switch (key) {
    case "DIGIFLAZZ":
      // Logger disuntik DI SINI, satu-satunya pabrik adapter untuk panggilan
      // keluar — jadi tidak ada jalur transaksi yang bisa lolos tanpa tercatat.
      return new DigiflazzAdapter(decryptJson<DigiflazzCredentials>(config.credentials), {
        log: recordProviderApiCall,
      });
    case "OKECONNECT":
      return new OkeConnectAdapter(decryptJson<OkeConnectCredentials>(config.credentials), {
        log: recordProviderApiCall,
      });
    default:
      throw new Error(`Provider ${key} belum didukung (adapter menyusul di Fase 5).`);
  }
}

// Shared helper - dipakai checkout.ts, fulfillment.ts (selectAndSend), dan catalog/public.ts
// (getProductForCheckout) yang masing-masing sebelumnya menjalankan query+Set yang sama persis.
export async function getActiveProviders(dbClient: DbLike = db as unknown as DbLike): Promise<Set<ProviderKey>> {
  const active = await dbClient.providerConfig.findMany({ where: { isActive: true }, select: { key: true } });
  return new Set(active.map((p) => p.key));
}
