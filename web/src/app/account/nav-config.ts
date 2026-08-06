import { House, PlusCircle, ReceiptText, Wallet, Settings } from "lucide-react";
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
// Jumlahnya sengaja dijaga di angka lima. Tab bar iOS mulai terasa sesak lewat
// dari itu, dan urutannya mengikuti seberapa sering dipakai: isi saldo dan
// riwayat transaksi jauh lebih sering dibuka daripada pengaturan.
export const ACCOUNT_NAV: AccountNavItem[] = [
  { href: "/account", label: "Beranda", icon: House },
  { href: "/account/deposit", label: "Isi Saldo", icon: PlusCircle },
  { href: "/account/orders", label: "Transaksi", icon: ReceiptText },
  { href: "/account/deposits", label: "Deposit", icon: Wallet },
  { href: "/account/settings", label: "Pengaturan", icon: Settings },
];

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
