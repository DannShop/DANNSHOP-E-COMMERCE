import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const MENU = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Produk & Harga" },
  { href: "/admin/providers", label: "Providers" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-muted/40 p-4">
        <p className="mb-4 text-lg font-bold">DannShop Admin</p>
        <nav className="flex flex-col gap-1 text-sm">
          {MENU.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="rounded px-2 py-1.5 hover:bg-muted"
            >
              {m.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
