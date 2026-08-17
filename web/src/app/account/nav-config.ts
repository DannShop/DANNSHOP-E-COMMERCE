import { House, PlusCircle, ReceiptText, Wallet, Handshake, Store, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Tipe ikon ditulis manual (bukan `LucideIcon`) supaya file ini tidak terikat
// pada nama tipe internal lucide yang bisa berubah antar versi mayor.
// Pola yang sama dipakai admin/nav-config.ts.
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface AccountNavItem {
  href: string;
  label: string;
  icon: IconType;
}

// Menu SIDEBAR DESKTOP. Semuanya tampil karena ruang vertikalnya memang ada -
// daftar setinggi tujuh baris tidak pernah terasa sesak di layar lebar.
//
// Tab bar mobile memakai daftar TERPISAH di bawah (ACCOUNT_NAV_MOBILE), bukan
// daftar ini. Dulu keduanya berbagi satu array, dan akibatnya tab bar ikut
// menampung tujuh tab: di layar 360px itu ~51px per tab, cukup untuk ikon tapi
// tidak untuk labelnya.
//
// Urutannya mengikuti seberapa sering dipakai: isi saldo dan riwayat transaksi
// jauh lebih sering dibuka daripada pengaturan.
export const ACCOUNT_NAV: AccountNavItem[] = [
  { href: "/account", label: "Beranda", icon: House },
  { href: "/account/deposit", label: "Isi Saldo", icon: PlusCircle },
  { href: "/account/orders", label: "Transaksi", icon: ReceiptText },
  { href: "/account/deposits", label: "Deposit", icon: Wallet },
  { href: "/account/reseller", label: "Reseller", icon: Store },
  { href: "/account/mitra", label: "Mitra", icon: Handshake },
  { href: "/account/settings", label: "Pengaturan", icon: Settings },
];

/**
 * Menu TAB BAR MOBILE - sengaja empat, bukan tujuh.
 *
 * Yang dipangkas bukan fiturnya, melainkan pintu masuknya:
 *   - "Isi Saldo" lebur ke dalam "Deposit". Dua tab bersebelahan yang namanya
 *     mirip tapi isinya berbeda (form vs riwayat) adalah tebakan, bukan menu.
 *   - "Reseller" & "Mitra" pindah ke dalam Pengaturan. Keduanya dibuka sekali
 *     saat mendaftar lalu nyaris tidak pernah lagi - frekuensi seumur hidup
 *     yang tidak sebanding dengan biaya tetap satu tab permanen.
 *
 * Keduanya tetap ada di sidebar desktop, dan route-nya tidak berubah sama
 * sekali - tautan lama yang sudah tersebar tetap bekerja.
 */
export const ACCOUNT_NAV_MOBILE: AccountNavItem[] = [
  { href: "/account", label: "Beranda", icon: House },
  { href: "/account/orders", label: "Transaksi", icon: ReceiptText },
  { href: "/account/deposit", label: "Deposit", icon: Wallet },
  { href: "/account/settings", label: "Pengaturan", icon: Settings },
];

/**
 * Kelas grid tab bar mobile, diturunkan dari panjang menu.
 *
 * Ditulis sebagai peta literal karena Tailwind memindai kelas secara statis —
 * `grid-cols-${n}` tidak akan pernah ikut ter-compile dan tab bar-nya jadi satu
 * kolom menumpuk.
 *
 * ⚠️ 5 adalah batas nyaman, 7 batas mutlak. Di layar 360px, tujuh tab berarti
 * ~51px per tab: ikonnya masih jelas, labelnya sudah mepet. Kalau menu mobile
 * perlu tambahan, GANTIKAN salah satu - jangan ditambahkan.
 */
export const ACCOUNT_NAV_GRID_CLASS: string =
  ({ 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6", 7: "grid-cols-7" } as Record<number, string>)[
    ACCOUNT_NAV_MOBILE.length
  ] ?? "grid-cols-5";

/**
 * `/account` adalah prefix dari SEMUA route panel, jadi khusus dia dicocokkan
 * persis - kalau tidak, "Beranda" ikut menyala di mana pun.
 *
 * Perhatikan `/account/deposit` (isi saldo) vs `/account/deposits` (riwayat):
 * keduanya tidak pernah saling menyalakan karena pencocokan prefix menuntut
 * garis miring sesudahnya - "/account/deposits" tidak diawali
 * "/account/deposit/". Halaman detail "/account/deposit/<id>" sengaja jatuh ke
 * "Isi Saldo" karena memang ujung dari alur pengisian saldo.
 */
export function isAccountNavActive(pathname: string, href: string): boolean {
  if (href === "/account") return pathname === "/account";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Halaman yang TIDAK punya tab sendiri di mobile, dan tab mana yang mewakilinya.
 *
 * Tanpa peta ini, membuka riwayat deposit atau halaman reseller di HP membuat
 * SELURUH tab bar padam - tidak ada satu pun yang menyala, dan yang dirasakan
 * orang bukan "menu ini tidak ada" melainkan "saya tersesat di luar aplikasi".
 * Tab induknya tetap menyala, jadi posisinya selalu punya jawaban.
 */
const MOBILE_NAV_PARENT: Record<string, string> = {
  "/account/deposits": "/account/deposit",
  "/account/reseller": "/account/settings",
  "/account/mitra": "/account/settings",
};

export function isMobileNavActive(pathname: string, href: string): boolean {
  for (const [child, parent] of Object.entries(MOBILE_NAV_PARENT)) {
    if (pathname === child || pathname.startsWith(`${child}/`)) return href === parent;
  }
  return isAccountNavActive(pathname, href);
}

export function resolveAccountPageTitle(pathname: string): string {
  // Halaman di luar daftar menu perlu judulnya sendiri; kalau tidak, layar
  // status pembayaran akan berjudul "Isi Saldo" dan terasa seperti salah
  // halaman padahal formnya sudah lewat.
  if (pathname.startsWith("/account/deposit/")) return "Status Deposit";

  const match = [...ACCOUNT_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isAccountNavActive(pathname, item.href));
  return match?.label ?? "Akun Saya";
}
