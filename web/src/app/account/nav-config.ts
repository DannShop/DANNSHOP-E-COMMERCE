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

// Satu-satunya sumber kebenaran menu panel user - dipakai sidebar desktop,
// tab bar mobile, DAN judul di header.
//
// Urutannya mengikuti seberapa sering dipakai: isi saldo dan riwayat transaksi
// jauh lebih sering dibuka daripada pengaturan.
//
// "Mitra" ditaruh di menu utama, bukan disembunyikan di dalam Pengaturan, dan
// itu keputusan yang disengaja: program mitra H2H hanya terbuka untuk member
// terdaftar, jadi SATU-SATUNYA cara orang tahu program ini ada adalah dengan
// melihatnya di sini. Menyembunyikannya berarti membuat pintu masuk yang tidak
// pernah ditemukan siapa pun.
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
 * Kelas grid tab bar mobile, diturunkan dari panjang menu.
 *
 * Ditulis sebagai peta literal karena Tailwind memindai kelas secara statis —
 * `grid-cols-${n}` tidak akan pernah ikut ter-compile dan tab bar-nya jadi satu
 * kolom menumpuk.
 *
 * ⚠️ 7 ADALAH BATASNYA, dan sudah tercapai (menu Reseller masuk 2026-08-17).
 * Di layar 360px itu berarti ~51px per tab — ikonnya masih jelas, labelnya
 * sudah mepet. Menu berikutnya WAJIB menggantikan salah satu yang ada, bukan
 * ditambahkan: lewat dari ini labelnya berhenti terbaca dan tab bar-nya jadi
 * deretan ikon tanpa keterangan.
 */
export const ACCOUNT_NAV_GRID_CLASS: string =
  ({ 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6", 7: "grid-cols-7" } as Record<number, string>)[
    ACCOUNT_NAV.length
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
