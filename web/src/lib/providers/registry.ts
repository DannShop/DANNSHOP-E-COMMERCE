import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { DigiflazzAdapter, type DigiflazzCredentials } from "./digiflazz";
import type { TopupProviderAdapter } from "./types";

type DbLike = { providerConfig: { findUnique: (args: { where: { key: ProviderKey } }) => Promise<{ credentials: unknown } | null> } };

// Satu-satunya jalan membuat adapter dari konfigurasi DB.
// Kredensial disimpan terenkripsi (Task 1) — didecrypt di sini, tidak pernah bocor ke client.
export async function getAdapter(
  key: ProviderKey,
  dbClient: DbLike = db as unknown as DbLike,
): Promise<TopupProviderAdapter> {
  const config = await dbClient.providerConfig.findUnique({ where: { key } });
  if (!config) throw new Error(`Provider ${key} belum dikonfigurasi di database.`);
  if (typeof config.credentials !== "string" || config.credentials.length === 0) {
    throw new Error(`Provider ${key} belum punya kredensial tersimpan.`);
  }

  switch (key) {
    case "DIGIFLAZZ":
      return new DigiflazzAdapter(decryptJson<DigiflazzCredentials>(config.credentials));
    default:
      throw new Error(`Provider ${key} belum didukung (adapter menyusul di Fase 5).`);
  }
}
