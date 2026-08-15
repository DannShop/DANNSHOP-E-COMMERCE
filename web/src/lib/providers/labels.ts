import type { ProviderKey } from "@prisma/client";

/**
 * Nama provider yang layak dibaca manusia.
 *
 * SENGAJA di modul sendiri, terpisah dari catalog-sources.ts: file itu mengimpor
 * `db`, sementara label ini juga dipakai Client Component (picker SKU, daftar
 * mapping). Menaruh keduanya dalam satu file akan menyeret Prisma ke bundel
 * browser.
 *
 * Sebelumnya daftar ini disalin di tiga tempat dengan catatan bahwa duplikasi
 * sekecil itu tidak apa-apa. Alasan itu gugur begitu daftarnya berhenti jadi
 * konstanta belaka: sekarang menu "Tambah produk" ikut memakainya dan isinya
 * ditentukan database, jadi satu salinan yang tertinggal berarti satu layar
 * menyebut provider dengan nama berbeda dari layar sebelahnya.
 */
export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  DIGIFLAZZ: "Digiflazz",
  OKECONNECT: "OkeConnect (OrderKuota)",
  QIOSPAY: "QiosPay",
  SERPUL: "Serpul",
};

export interface CatalogSource {
  key: ProviderKey;
  label: string;
  isActive: boolean;
}
