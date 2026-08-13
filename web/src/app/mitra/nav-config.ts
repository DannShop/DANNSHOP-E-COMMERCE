import { BookText, KeyRound, LayoutDashboard, PackageSearch, ReceiptText, Wallet, Webhook } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Tipe ikon ditulis manual (bukan `LucideIcon`) supaya file ini tidak terikat
// pada nama tipe internal lucide yang bisa berubah antar versi mayor.
// Pola yang sama dipakai account/nav-config.ts dan admin/nav-config.ts.
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface MitraNavItem {
  href: string;
  label: string;
  icon: IconType;
  /** Keterangan singkat, dipakai sebagai judul kedua di header halaman. */
  hint: string;
}

/**
 * Menu portal mitra.
 *
 * Isinya diturunkan dari pertanyaan yang PASTI muncul saat seseorang
 * mengintegrasikan API ini, bukan dari daftar tabel yang kebetulan kita punya:
 *
 *  - "kredensial saya apa, dan kenapa panggilan saya ditolak?"  -> Kredensial
 *  - "gimana cara panggilnya?"                                  -> Dokumentasi
 *  - "SKU-nya apa saja, harganya berapa untuk saya?"            -> Katalog
 *  - "transaksi saya tadi jadi apa?"                            -> Transaksi
 *  - "kenapa callback saya tidak masuk?"                        -> Callback
 *  - "saldo saya sisa berapa?"                                  -> Saldo
 */
export const MITRA_NAV: MitraNavItem[] = [
  { href: "/mitra", label: "Beranda", icon: LayoutDashboard, hint: "Ringkasan integrasi" },
  { href: "/mitra/kredensial", label: "Kredensial", icon: KeyRound, hint: "API key, IP, dan callback" },
  { href: "/mitra/dokumentasi", label: "Dokumentasi", icon: BookText, hint: "Spesifikasi API H2H" },
  { href: "/mitra/katalog", label: "Katalog", icon: PackageSearch, hint: "SKU & harga untuk akunmu" },
  { href: "/mitra/transaksi", label: "Transaksi", icon: ReceiptText, hint: "Order yang masuk lewat API" },
  { href: "/mitra/callback", label: "Callback", icon: Webhook, hint: "Percobaan kirim & error" },
  { href: "/mitra/saldo", label: "Saldo", icon: Wallet, hint: "Mutasi & isi saldo" },
];

/**
 * `/mitra` adalah prefix dari SEMUA route portal, jadi khusus dia dicocokkan
 * persis — kalau tidak, "Beranda" ikut menyala di mana pun.
 */
export function isMitraNavActive(pathname: string, href: string): boolean {
  if (href === "/mitra") return pathname === "/mitra";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveMitraPage(pathname: string): MitraNavItem {
  const match = [...MITRA_NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isMitraNavActive(pathname, item.href));
  return match ?? MITRA_NAV[0];
}
