import {
  Handshake,
  LayoutDashboard,
  ClipboardList,
  Wallet,
  TrendingUp,
  Package,
  FolderTree,
  Percent,
  GalleryHorizontalEnd,
  Settings,
  CreditCard,
  KeyRound,
  Server,
  Webhook,
  Radio,
  Activity,
  Crown,
  Users,
  Palette,
  ReceiptText,
  BarChart3,
  ScanSearch,
  Plug,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Tipe ikon ditulis manual (bukan `LucideIcon`) supaya file ini tidak terikat
// pada nama tipe internal lucide yang bisa berubah antar versi mayor.
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
}

export interface NavGroup {
  /** "" = grup tanpa judul (dipakai untuk item tunggal paling atas). */
  label: string;
  items: NavItem[];
}

// Satu-satunya sumber kebenaran menu admin - dipakai sidebar (daftar menu) DAN
// header (menurunkan judul halaman dari pathname). Menambah halaman admin baru
// cukup menambah entri di sini, tidak perlu menyentuh dua tempat terpisah.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Transaksi",
    items: [
      { href: "/admin/orders", label: "Orders", icon: ClipboardList },
      { href: "/admin/wallet-ledger", label: "Mutasi Saldo", icon: Wallet },
      { href: "/admin/reports", label: "Laporan Penjualan", icon: TrendingUp },
    ],
  },
  {
    label: "Katalog",
    items: [
      { href: "/admin/products", label: "Produk & Harga", icon: Package },
      { href: "/admin/categories", label: "Kategori", icon: FolderTree },
      { href: "/admin/markup", label: "Markup Harga", icon: Percent },
    ],
  },
  {
    label: "Membership",
    items: [
      { href: "/admin/users", label: "Kontrol User", icon: Users },
      { href: "/admin/membership-tiers", label: "Tier Member", icon: Crown },
    ],
  },
  {
    label: "Storefront",
    items: [
      { href: "/admin/banners", label: "Banner", icon: GalleryHorizontalEnd },
      { href: "/admin/appearance", label: "Tampilan & Tema", icon: Palette },
      { href: "/admin/invoice", label: "Invoice & Struk", icon: ReceiptText },
      { href: "/admin/settings", label: "Pengaturan Situs", icon: Settings },
    ],
  },
  {
    label: "Pembayaran & Provider",
    items: [
      { href: "/admin/payment-config", label: "Konfigurasi Payment", icon: KeyRound },
      { href: "/admin/payment-methods", label: "Metode Pembayaran", icon: CreditCard },
      { href: "/admin/providers", label: "Providers", icon: Server },
      { href: "/admin/id-check", label: "Cek ID Game", icon: ScanSearch },
      { href: "/admin/webhooks", label: "Log Callback", icon: Webhook },
      { href: "/admin/provider-logs", label: "Log API Provider", icon: Radio },
    ],
  },
  {
    label: "Sistem",
    items: [
      { href: "/admin/partnership", label: "Pengajuan Mitra", icon: Handshake },
      { href: "/admin/partners", label: "API Partner", icon: Plug },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/jobs", label: "Monitoring Job", icon: Activity },
    ],
  },
];

// `/admin` adalah prefix dari SEMUA route admin, jadi khusus dia dicocokkan
// persis - kalau tidak, "Dashboard" akan selalu ikut tersorot aktif di mana pun.
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Judul di header diturunkan dari pathname. Dicocokkan dari href TERPANJANG
// dulu supaya route bersarang (mis. /admin/orders/INV-123) tetap mengambil
// judul induknya ("Orders"), bukan jatuh ke "Dashboard".
export function resolvePageTitle(pathname: string): string {
  const all = NAV_GROUPS.flatMap((g) => g.items);
  const match = [...all]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isNavItemActive(pathname, item.href) || pathname.startsWith(`${item.href}/`));
  return match?.label ?? "Admin";
}
