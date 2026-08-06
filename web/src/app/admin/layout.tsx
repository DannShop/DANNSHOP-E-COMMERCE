import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const MENU_GROUPS = [
  {
    label: "",
    items: [{ href: "/admin", label: "Dashboard" }],
  },
  {
    label: "Transaksi",
    items: [
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/wallet-ledger", label: "Mutasi Saldo" },
      { href: "/admin/reports", label: "Laporan Penjualan" },
    ],
  },
  {
    label: "Katalog",
    items: [
      { href: "/admin/products", label: "Produk & Harga" },
      { href: "/admin/categories", label: "Kategori" },
      { href: "/admin/markup", label: "Markup Harga" },
    ],
  },
  {
    label: "Storefront",
    items: [
      { href: "/admin/banners", label: "Banner" },
      { href: "/admin/settings", label: "Pengaturan Situs" },
    ],
  },
  {
    label: "Pembayaran & Provider",
    items: [
      { href: "/admin/payment-methods", label: "Metode Pembayaran" },
      { href: "/admin/providers", label: "Providers" },
      { href: "/admin/webhooks", label: "Log Callback" },
    ],
  },
  {
    label: "Sistem",
    items: [{ href: "/admin/jobs", label: "Monitoring Job" }],
  },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 overflow-y-auto border-r bg-muted/40 p-4">
        <p className="mb-4 text-lg font-bold">DannShop Admin</p>
        <nav className="flex flex-col gap-4 text-sm">
          {MENU_GROUPS.map((group) => (
            <div key={group.label || "root"} className="flex flex-col gap-1">
              {group.label && (
                <p className="px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
              )}
              {group.items.map((m) => (
                <Link key={m.href} href={m.href} className="rounded px-2 py-1.5 hover:bg-muted">
                  {m.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
