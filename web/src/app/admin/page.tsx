import Link from "next/link";
import { TriangleAlert, ClipboardList, Wallet, Boxes, ReceiptText } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSalesSummary, startOfDay, endOfDay } from "@/lib/reports/sales";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

function StatCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="rounded-xl border p-4 transition-colors hover:bg-muted/40">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

const QUICK_LINKS = [
  { href: "/admin/orders", label: "Kelola Order", icon: ClipboardList },
  { href: "/admin/products", label: "Kelola Produk", icon: Boxes },
  { href: "/admin/wallet-ledger", label: "Mutasi Saldo", icon: Wallet },
  { href: "/admin/reports", label: "Laporan Lengkap", icon: ReceiptText },
];

export default async function AdminDashboardPage() {
  const session = await auth();
  const today = new Date();

  const [todaySummary, needsReviewCount, refundPendingCount, lowBalanceProviders] = await Promise.all([
    getSalesSummary(startOfDay(today), endOfDay(today)),
    db.order.count({ where: { status: "NEEDS_REVIEW" } }),
    db.order.count({ where: { status: "REFUND_PENDING" } }),
    db.providerConfig.findMany({ where: { balanceAlertStatus: "LOW", isActive: true }, select: { displayName: true, balance: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Admin</h1>
        <p className="text-sm text-muted-foreground">
          Login sebagai: {session?.user?.email} (role: {session?.user?.role})
        </p>
      </div>

      {(needsReviewCount > 0 || refundPendingCount > 0 || lowBalanceProviders.length > 0) && (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            Perlu perhatian
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {needsReviewCount > 0 && (
              <li>
                <Link href="/admin/orders?tab=needs_review" className="underline hover:text-destructive">
                  {needsReviewCount} order butuh ditinjau manual
                </Link>
              </li>
            )}
            {refundPendingCount > 0 && (
              <li>
                <Link href="/admin/orders?tab=refund_pending" className="underline hover:text-destructive">
                  {refundPendingCount} order menunggu refund
                </Link>
              </li>
            )}
            {lowBalanceProviders.map((p) => (
              <li key={p.displayName}>
                <Link href="/admin/providers" className="underline hover:text-destructive">
                  Saldo {p.displayName} rendah ({formatRupiah(p.balance)})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Hari ini</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Omzet Hari Ini" value={formatRupiah(todaySummary.totalRevenue)} href="/admin/reports" />
          <StatCard label="Order Hari Ini" value={String(todaySummary.orderCount)} href="/admin/orders" />
          <StatCard
            label="Rata-rata per Order"
            value={formatRupiah(todaySummary.orderCount > 0 ? todaySummary.totalRevenue / BigInt(todaySummary.orderCount) : 0n)}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Akses Cepat</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors hover:bg-muted/40"
            >
              <l.icon className="size-4 text-primary" aria-hidden="true" />
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
