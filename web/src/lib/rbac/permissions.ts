// Katalog izin panel admin.
//
// DIDEFINISIKAN DI KODE, bukan dibuat admin - pola yang sama persis dengan
// lib/membership/benefits.ts, dan alasannya sama: setiap key di sini WAJIB
// benar-benar diperiksa oleh sesuatu. Izin yang cuma bisa dicentang tapi tidak
// pernah dicek adalah lubang yang terlihat seperti pagar.
//
// Yang BISA dibuat admin adalah PERANNYA (StaffRole) - kumpulan izin dari
// katalog ini yang diberi nama sendiri, mis. "Operator Order" atau "CS Malam".
//
// ⚠️ Mengelola peran & karyawan SENGAJA BUKAN izin di daftar ini, melainkan
// dikunci ke role ADMIN. Kalau ia jadi izin, karyawan yang memegangnya bisa
// menaikkan izinnya sendiri (atau izin temannya) sampai setara pemilik toko -
// dan tidak ada satu pun error yang akan menandainya.

export const PERMISSIONS = [
  "orders.view",
  "orders.refund",
  "finance.view",
  "catalog.manage",
  "users.view",
  "users.manage",
  "storefront.manage",
  "payments.manage",
  "system.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface PermissionDefinition {
  key: Permission;
  label: string;
  description: string;
  /** Judul kelompok di panel, mengikuti pengelompokan menu sidebar. */
  group: string;
  /**
   * Izin yang menyentuh UANG atau AKSES AKUN orang lain. Ditandai supaya panel
   * bisa menonjolkannya - inilah yang membedakan "boleh memproses pesanan" dari
   * "boleh mengembalikan uang", dan admin harus melihat bedanya saat mencentang.
   */
  sensitive?: true;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    key: "orders.view",
    label: "Kelola pesanan",
    description:
      "Membuka daftar & detail pesanan, mengulang pengiriman yang gagal, dan menandai pesanan manual selesai.",
    group: "Transaksi",
  },
  {
    key: "orders.refund",
    label: "Refund & batalkan pesanan",
    description:
      "Mengembalikan uang pembeli dan membatalkan pesanan. Dipisah dari 'Kelola pesanan' supaya orang yang memproses pesanan tidak otomatis bisa mengeluarkan uang.",
    group: "Transaksi",
    sensitive: true,
  },
  {
    key: "finance.view",
    label: "Lihat keuangan",
    description:
      "Dashboard omzet, Mutasi Saldo, dan Laporan Penjualan. Tanpa izin ini, halaman depan panel tidak terbuka karena isinya angka pendapatan.",
    group: "Transaksi",
  },
  {
    key: "catalog.manage",
    label: "Kelola katalog",
    description: "Produk & harga, kategori, markup harga, dan kode promo.",
    group: "Katalog",
  },
  {
    key: "users.view",
    label: "Lihat user & tier",
    description: "Membuka daftar user, detail user, dan daftar tier member — tanpa bisa mengubah apa pun.",
    group: "Membership",
  },
  {
    key: "users.manage",
    label: "Kelola akun user",
    description:
      "Menangguhkan/memulihkan akun, mereset password user, membuat & mengubah tier, dan memberi tier manual.",
    group: "Membership",
    sensitive: true,
  },
  {
    key: "storefront.manage",
    label: "Kelola tampilan toko",
    description: "Banner, tampilan & tema, invoice & struk, serta pengaturan situs.",
    group: "Storefront",
  },
  {
    key: "payments.manage",
    label: "Kelola pembayaran & provider",
    description:
      "Konfigurasi payment gateway, metode pembayaran, provider, cek ID game, dan log callback/API. Termasuk kredensial.",
    group: "Pembayaran & Provider",
    sensitive: true,
  },
  {
    key: "system.manage",
    label: "Kelola sistem",
    description: "Pengajuan mitra, API partner, analytics, monitoring job, dan aplikasi mobile.",
    group: "Sistem",
  },
];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isValidPermission(key: string): key is Permission {
  return PERMISSION_SET.has(key);
}

/**
 * Baca daftar izin dari kolom Json, saring SAAT DIBACA.
 *
 * Pola yang sama dipakai parseBenefits & parsePwaSettings: baris bisa saja
 * pernah ditulis lewat jalur lain (skrip, akses DB langsung, versi kode lama
 * yang punya key berbeda), dan gerbang akses tidak boleh bergantung pada asumsi
 * bahwa isi database pasti bersih. Key yang tidak dikenal DIBUANG, bukan
 * dibiarkan lewat.
 */
export function parsePermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<Permission>();
  for (const item of raw) {
    if (typeof item === "string" && isValidPermission(item)) seen.add(item);
  }
  return [...seen];
}

/** Kelompok izin untuk ditampilkan di panel, urut sesuai katalog. */
export function groupedPermissions(): { group: string; items: PermissionDefinition[] }[] {
  const groups: { group: string; items: PermissionDefinition[] }[] = [];
  for (const def of PERMISSION_CATALOG) {
    const existing = groups.find((g) => g.group === def.group);
    if (existing) existing.items.push(def);
    else groups.push({ group: def.group, items: [def] });
  }
  return groups;
}
