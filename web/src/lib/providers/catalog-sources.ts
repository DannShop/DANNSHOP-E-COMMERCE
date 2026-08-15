import { db } from "@/lib/db";
import { PROVIDER_LABELS, type CatalogSource } from "./labels";

export type { CatalogSource };

/**
 * Provider yang boleh muncul sebagai sumber produk.
 *
 * Saringannya "punya kredensial tersimpan", BUKAN "isActive". Dua alasan:
 *
 *  - Provider yang belum pernah diisi kredensialnya (QiosPay & Serpul hari ini:
 *    ada di enum ProviderKey, adapter-nya belum dibuat) tidak akan pernah punya
 *    price list. Menampilkannya cuma menyediakan pilihan yang dijamin
 *    mengembalikan layar kosong tanpa keterangan — persis jenis jalan buntu yang
 *    membuat orang mengira aplikasinya rusak.
 *  - Sebaliknya, `isActive` TERLALU ketat di sini. isActive = "boleh melayani
 *    order baru", sementara menyusun katalog justru pekerjaan yang wajar
 *    dilakukan SEBELUM provider dinyalakan. Menyaring dengan isActive memaksa
 *    admin mengaktifkan provider yang belum diverifikasi hanya untuk bisa
 *    melihat produknya.
 *
 * `isActive` tetap ikut dikembalikan supaya layar bisa memberi tanda "belum
 * aktif" — informasi yang berguna, tapi bukan alasan menyembunyikan.
 */
export async function getCatalogSources(): Promise<CatalogSource[]> {
  const configs = await db.providerConfig.findMany({
    select: { key: true, credentials: true, isActive: true },
    orderBy: { priority: "asc" },
  });
  return configs
    .filter((c) => typeof c.credentials === "string" && c.credentials.length > 0)
    .map((c) => ({ key: c.key, label: PROVIDER_LABELS[c.key] ?? c.key, isActive: c.isActive }));
}
