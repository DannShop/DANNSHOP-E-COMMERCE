import Link from "next/link";
import {
  TriangleAlert,
  ClipboardList,
  Wallet,
  Boxes,
  ReceiptText,
  Coins,
  ShoppingBag,
  Scale,
  ArrowUpRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSalesSummary, startOfDay, endOfDay } from "@/lib/reports/sales";
import { CRON_STALE_MINUTES, getCronHealth } from "@/lib/jobs/heartbeat";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const content = (
    <div className="glass-card group/stat relative h-full overflow-hidden rounded-2xl p-5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-300">
          <Icon className="size-[18px]" />
        </span>
        {href && (
          <ArrowUpRight
            className="size-4 shrink-0 text-muted-foreground/50 transition-[transform,color] duration-300 ease-out group-hover/stat:translate-x-0.5 group-hover/stat:-translate-y-0.5 group-hover/stat:text-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <p className="mt-4 text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tracking-tight tabular-nums">{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

const QUICK_LINKS = [
  { href: "/admin/orders", label: "Kelola Order", icon: ClipboardList },
  { href: "/admin/products", label: "Kelola Produk", icon: Boxes },
  { href: "/admin/wallet-ledger", label: "Mutasi Saldo", icon: Wallet },
  { href: "/admin/reports", label: "Laporan Lengkap", icon: ReceiptText },
];

export default async function AdminDashboardPage() {
  const today = new Date();

  const [todaySummary, needsReviewCount, refundPendingCount, lowBalanceProviders, cronHealth, overdueJobs] =
    await Promise.all([
      getSalesSummary(startOfDay(today), endOfDay(today)),
      db.order.count({ where: { status: "NEEDS_REVIEW" } }),
      db.order.count({ where: { status: "REFUND_PENDING" } }),
      db.providerConfig.findMany({
        where: { balanceAlertStatus: "LOW", isActive: true },
        select: { displayName: true, balance: true },
      }),
      getCronHealth(today),
      // Job yang jatuh tempo lebih dari ambang basi. Angka ini yang menerjemahkan
      // "cron mati" jadi kerugian yang konkret bagi admin: sekian pekerjaan
      // menumpuk dan tidak ada yang mengerjakannya.
      db.job.count({
        where: { status: "PENDING", runAt: { lt: new Date(today.getTime() - CRON_STALE_MINUTES * 60_000) } },
      }),
    ]);

  const hasAlerts = needsReviewCount > 0 || refundPendingCount > 0 || lowBalanceProviders.length > 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight">Selamat datang kembali</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ringkasan performa toko hari ini.
        </p>
      </div>

      {/* ===== Cron mati =====
          Ditaruh DI ATAS panel peringatan biasa dan dengan gaya sendiri, bukan
          sebagai satu baris di dalamnya, karena akibatnya beda kelas: kalau cron
          mati, order berhenti auto-expire, callback mitra tidak pernah terkirim,
          dan order yang sudah sukses di provider bisa nyangkut "Diproses"
          selamanya. Sinyalnya sengaja dipicu oleh admin yang membuka panel ini —
          jadi tidak bergantung pada cron yang justru sedang mati. */}
      {cronHealth.stale && (
        <div className="glass-card overflow-hidden rounded-2xl border-destructive/40 bg-destructive/[0.04] p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <span className="grid size-8 place-items-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
              <TriangleAlert className="size-4" aria-hidden="true" />
            </span>
            Cron tidak berjalan
          </p>
          <p className="mt-2.5 text-sm text-foreground/80">
            {cronHealth.neverSeen ? (
              <>
                Belum pernah ada satu pun panggilan <code className="rounded bg-foreground/10 px-1">/api/cron/tick</code>{" "}
                yang tercatat.
              </>
            ) : (
              <>
                Panggilan terakhir <strong className="text-destructive">{cronHealth.minutesSinceLastTick} menit lalu</strong>{" "}
                ({cronHealth.lastTickAt ? DATE_FMT.format(cronHealth.lastTickAt) : "—"}). Seharusnya tiap menit.
              </>
            )}{" "}
            Selama ini berlangsung: order tidak auto-expire, harga tidak tersinkron, callback mitra tidak terkirim, dan
            order yang sudah sukses di provider bisa nyangkut &quot;Diproses&quot;.
            {overdueJobs > 0 && (
              <>
                {" "}
                <strong className="text-destructive">{overdueJobs} job</strong> sudah menumpuk lewat jadwalnya.
              </>
            )}
          </p>
          <p className="mt-2.5 text-xs text-muted-foreground">
            Cron proyek ini <strong className="text-foreground">eksternal</strong> (cPanel Rumahweb →{" "}
            <code className="rounded bg-foreground/10 px-1">POST /api/cron/tick</code>), bukan cron Vercel. Periksa
            berurutan: <strong className="text-foreground">(1)</strong> URL di cron eksternal masih menunjuk domain yang
            hidup sekarang — domain Vercel lama akan menjawab 404 tiap menit tanpa gejala apa pun;{" "}
            <strong className="text-foreground">(2)</strong> panggil endpoint-nya manual — sejak sekarang balasan 401
            menyertakan <code className="rounded bg-foreground/10 px-1">reason</code> yang menyebutkan apakah{" "}
            <code className="rounded bg-foreground/10 px-1">CRON_SECRET</code> belum terpasang atau secretnya tidak
            cocok.
          </p>
          <Link
            href="/admin/jobs"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-destructive underline-offset-4 hover:underline"
          >
            Buka Monitoring Job <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Panel peringatan hanya muncul kalau memang ada yang perlu ditangani -
          bukan kartu kosong permanen yang lama-lama diabaikan. */}
      {hasAlerts && (
        <div className="glass-card overflow-hidden rounded-2xl border-destructive/25 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <span className="grid size-8 place-items-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
              <TriangleAlert className="size-4" aria-hidden="true" />
            </span>
            Perlu perhatian
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {needsReviewCount > 0 && (
              <li>
                <Link
                  href="/admin/orders?tab=needs_review"
                  className="inline-flex items-center gap-1.5 text-foreground/80 underline-offset-4 transition-colors duration-200 ease-out hover:text-destructive hover:underline"
                >
                  {needsReviewCount} order butuh ditinjau manual
                </Link>
              </li>
            )}
            {refundPendingCount > 0 && (
              <li>
                <Link
                  href="/admin/orders?tab=refund_pending"
                  className="inline-flex items-center gap-1.5 text-foreground/80 underline-offset-4 transition-colors duration-200 ease-out hover:text-destructive hover:underline"
                >
                  {refundPendingCount} order menunggu refund
                </Link>
              </li>
            )}
            {lowBalanceProviders.map((p) => (
              <li key={p.displayName}>
                <Link
                  href="/admin/providers"
                  className="inline-flex items-center gap-1.5 text-foreground/80 underline-offset-4 transition-colors duration-200 ease-out hover:text-destructive hover:underline"
                >
                  Saldo {p.displayName} rendah ({formatRupiah(p.balance)})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-wide">Hari ini</h3>
          <Link
            href="/admin/reports"
            className="text-xs text-muted-foreground underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground hover:underline"
          >
            Lihat laporan lengkap
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Omzet Hari Ini"
            value={formatRupiah(todaySummary.totalRevenue)}
            icon={Coins}
            href="/admin/reports"
          />
          <StatCard
            label="Order Hari Ini"
            value={String(todaySummary.orderCount)}
            icon={ShoppingBag}
            href="/admin/orders"
          />
          <StatCard
            label="Rata-rata per Order"
            value={formatRupiah(
              todaySummary.orderCount > 0
                ? todaySummary.totalRevenue / BigInt(todaySummary.orderCount)
                : 0n,
            )}
            icon={Scale}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-wide">Akses Cepat</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="glass-card group/quick flex items-center gap-3 rounded-2xl p-4 text-sm font-medium transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-300">
                <l.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate">{l.label}</span>
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground/50 transition-[transform,color] duration-300 ease-out group-hover/quick:translate-x-0.5 group-hover/quick:-translate-y-0.5 group-hover/quick:text-foreground"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
