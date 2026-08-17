import type { Permission } from "@/lib/rbac/permissions";

// Keputusan akses panel admin. MURNI: nol DB, nol React, nol ikon.
//
// Kemurnian itu syarat, bukan selera - berkas ini diimpor oleh proxy.ts
// (middleware), dan menyeret klien Prisma atau pustaka ikon ke sana akan ikut
// masuk ke bundel yang dijalankan pada SETIAP request.

/**
 * Satu-satunya tempat union role ditulis.
 *
 * Sengaja disebar dari sini ke session/JWT/credentials, bukan diketik ulang di
 * tiap berkas: union yang disalin akan menyimpang saat ada role baru, dan
 * gejalanya bukan galat tipe melainkan role yang diam-diam tidak pernah cocok
 * dengan apa pun.
 */
export type UserRole = "USER" | "ADMIN" | "STAFF";

export interface AdminViewer {
  role: UserRole;
  permissions: Permission[];
}

/** Boleh masuk panel sama sekali? */
export function canEnterAdmin(role: string | undefined): boolean {
  return role === "ADMIN" || role === "STAFF";
}

/**
 * ADMIN selalu lolos, tanpa perlu dicentang apa pun.
 *
 * Pemilik toko tidak boleh bisa mengunci dirinya sendiri di luar panelnya
 * sendiri, dan daftar izin yang harus ikut diperbarui setiap kali ada izin baru
 * adalah cara paling mudah untuk itu terjadi tanpa disadari.
 */
export function hasPermission(viewer: AdminViewer, permission: Permission): boolean {
  if (viewer.role === "ADMIN") return true;
  if (viewer.role !== "STAFF") return false;
  return viewer.permissions.includes(permission);
}

interface RouteRule {
  prefix: string;
  /** null = cukup bisa masuk panel (mis. halaman keamanan akun sendiri). */
  permission: Permission | null;
  /** true = HANYA role ADMIN, tidak bisa didelegasikan lewat izin apa pun. */
  adminOnly?: true;
}

/**
 * Route admin dan izin yang dibutuhkannya.
 *
 * Urutannya SENGAJA dari yang paling spesifik ke yang paling umum, dan
 * pencocokannya berhenti di kecocokan pertama - `/admin` adalah awalan dari
 * semua route lain, jadi ia wajib berada paling bawah.
 *
 * ⚠️ Halaman admin BARU yang tidak terdaftar di sini akan jatuh ke aturan
 * `/admin` (butuh `finance.view`). Itu disengaja: bawaan yang salah-arah lebih
 * baik menutup daripada membuka. Kalau menambah halaman, tambahkan barisnya.
 */
export const ADMIN_ROUTE_RULES: RouteRule[] = [
  // ADMIN saja - lihat catatan di permissions.ts soal kenapa ini bukan izin.
  { prefix: "/admin/staff", permission: null, adminOnly: true },

  { prefix: "/admin/orders", permission: "orders.view" },
  { prefix: "/admin/wallet-ledger", permission: "finance.view" },
  { prefix: "/admin/reports", permission: "finance.view" },

  { prefix: "/admin/products", permission: "catalog.manage" },
  { prefix: "/admin/categories", permission: "catalog.manage" },
  { prefix: "/admin/markup", permission: "catalog.manage" },
  { prefix: "/admin/vouchers", permission: "catalog.manage" },

  { prefix: "/admin/users", permission: "users.view" },
  { prefix: "/admin/membership-tiers", permission: "users.view" },
  { prefix: "/admin/reseller", permission: "users.view" },

  { prefix: "/admin/banners", permission: "storefront.manage" },
  { prefix: "/admin/appearance", permission: "storefront.manage" },
  { prefix: "/admin/invoice", permission: "storefront.manage" },
  { prefix: "/admin/settings", permission: "storefront.manage" },

  { prefix: "/admin/payment-config", permission: "payments.manage" },
  { prefix: "/admin/payment-methods", permission: "payments.manage" },
  { prefix: "/admin/providers", permission: "payments.manage" },
  { prefix: "/admin/id-check", permission: "payments.manage" },
  { prefix: "/admin/webhooks", permission: "payments.manage" },
  { prefix: "/admin/provider-logs", permission: "payments.manage" },

  { prefix: "/admin/partnership", permission: "system.manage" },
  { prefix: "/admin/partners", permission: "system.manage" },
  { prefix: "/admin/analytics", permission: "system.manage" },
  { prefix: "/admin/jobs", permission: "system.manage" },
  { prefix: "/admin/mobile-app", permission: "system.manage" },

  // Selalu terbuka untuk siapa pun yang boleh masuk panel: mengatur 2FA-nya
  // SENDIRI dan membaca panduan. Menggerbang halaman keamanan akan mengunci
  // karyawan di luar panel selamanya - gerbang 2FA mewajibkan mereka memasang
  // 2FA lebih dulu, dan satu-satunya tempat memasangnya ada di sana.
  { prefix: "/admin/keamanan", permission: null },
  { prefix: "/admin/panduan", permission: null },

  // Halaman depan panel berisi ringkasan omzet, jadi diperlakukan sebagai data
  // keuangan. Karyawan tanpa izin ini diantar ke halaman pertama yang boleh
  // dia buka (lihat firstAllowedPath), bukan ditolak mentah-mentah.
  { prefix: "/admin", permission: "finance.view" },
];

function ruleFor(pathname: string): RouteRule | null {
  return (
    ADMIN_ROUTE_RULES.find(
      (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`),
    ) ?? null
  );
}

export function canAccessAdminPath(viewer: AdminViewer, pathname: string): boolean {
  const rule = ruleFor(pathname);
  // Bukan route admin sama sekali - bukan urusan berkas ini.
  if (!rule) return true;
  if (rule.adminOnly) return viewer.role === "ADMIN";
  if (!rule.permission) return canEnterAdmin(viewer.role);
  return hasPermission(viewer, rule.permission);
}

/**
 * Halaman pertama yang boleh dibuka viewer ini.
 *
 * Dipakai saat karyawan membuka route yang tidak boleh dia akses (termasuk
 * halaman depan panel). Mengantar ke tempat yang berguna jauh lebih baik
 * daripada layar "akses ditolak" yang tidak menawarkan jalan ke mana pun -
 * apalagi karena tujuan tersering yang ditolak adalah `/admin` itu sendiri,
 * yang otomatis dituju setiap kali karyawan login.
 *
 * `/admin/keamanan` selalu jadi jaring terakhir: izinnya null, jadi mustahil
 * mengembalikan tujuan yang justru ditolak lagi dan berputar-putar.
 */
export function firstAllowedAdminPath(viewer: AdminViewer): string {
  if (viewer.role === "ADMIN") return "/admin";
  const rule = ADMIN_ROUTE_RULES.find(
    (r) => !r.adminOnly && (r.permission === null || hasPermission(viewer, r.permission)),
  );
  return rule?.prefix ?? "/admin/keamanan";
}
