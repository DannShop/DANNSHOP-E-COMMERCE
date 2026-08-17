import Link from "next/link";
import { Eye, Users, MousePointerClick, ShoppingBag, Coins, Scale, UserPlus, Store } from "lucide-react";
import { getTrafficSummary, getConversionSummary } from "@/lib/analytics/query";
import { getOverview } from "@/lib/reports/overview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard, Panel, RangePicker, resolveRange } from "@/components/admin/stat-card";
import { TrafficChart, RevenueProfitChart, RankedBarChart } from "@/components/admin/charts";
import { LivePanel } from "./live-panel";

export const dynamic = "force-dynamic";

const DEVICE_LABEL: Record<string, string> = { mobile: "Ponsel", tablet: "Tablet", desktop: "Desktop" };

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { from, to, activeDays } = resolveRange(params, 30);

  const [traffic, conversion, overview] = await Promise.all([
    getTrafficSummary(from, to),
    getConversionSummary(from, to),
    getOverview(from, to),
  ]);

  const { totals, people, daily, topProducts, byCategory, paymentMix } = overview;
  const marginLabel = totals.revenueWithCost > 0n ? `${(totals.marginBp / 100).toFixed(1)}%` : "—";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold tracking-tight">Analytics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kunjungan, konversi, dan performa penjualan dalam satu rentang waktu yang sama.
          </p>
        </div>
        <RangePicker basePath="/admin/analytics" from={from} to={to} activeDays={activeDays} />
      </div>

      {traffic.partialFromRollup && (
        <p className="rounded-xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          Sebagian rentang ini sudah melewati masa simpan data mentah, jadi angka kunjungannya diambil dari rangkuman
          harian. Rincian halaman & perujuk untuk periode itu tidak lagi tersedia.
        </p>
      )}

      <LivePanel />

      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-wide">Penjualan</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Omzet" value={formatRupiah(totals.totalRevenue)} icon={Coins} />
          <StatCard
            label="Laba bersih"
            value={formatRupiah(totals.profit)}
            icon={Scale}
            hint={totals.ordersWithoutCost > 0 ? `${totals.ordersWithoutCost} order tanpa catatan modal` : undefined}
          />
          <StatCard label="Margin" value={marginLabel} icon={Scale} />
          <StatCard
            label="Rata-rata per order"
            value={formatRupiah(totals.averageOrder)}
            icon={ShoppingBag}
            hint={`${totals.orderCount} order`}
          />
        </div>
      </section>

      <Panel
        title="Omzet & laba harian"
        action={
          <Link href="/admin/reports" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
            Laporan lengkap
          </Link>
        }
      >
        <RevenueProfitChart data={daily} />
      </Panel>

      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-wide">Kunjungan</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pageview" value={traffic.pageviews.toLocaleString("id-ID")} icon={Eye} />
          <StatCard
            label="Pengunjung unik"
            value={traffic.visitors.toLocaleString("id-ID")}
            icon={Users}
            hint={`${traffic.sessions.toLocaleString("id-ID")} sesi`}
          />
          <StatCard
            label="Member berkunjung"
            value={people.membersVisiting.toLocaleString("id-ID")}
            icon={UserPlus}
            hint={`${people.newUsers} member baru`}
          />
          <StatCard
            label="Reseller"
            value={String(people.resellersTotal)}
            icon={Store}
            hint={`${people.resellersPaid} pakai paket berbayar`}
          />
        </div>
      </section>

      <Panel title="Trafik harian">
        <TrafficChart data={traffic.daily} />
      </Panel>

      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-wide">Corong Kunjungan → Transaksi</h3>
        {/* Rasio KASAR, dan itu perlu dikatakan: "pengunjung" datang dari
            PageView dan "order" dari tabel Order — keduanya tidak saling
            terhubung per orang. Berguna untuk melihat tren naik/turun, bukan
            untuk melacak satu orang dari kunjungan sampai bayar. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pengunjung" value={conversion.visitors.toLocaleString("id-ID")} icon={Users} />
          <StatCard
            label="Lihat halaman produk"
            value={conversion.productPageViews.toLocaleString("id-ID")}
            icon={MousePointerClick}
            hint={percent(conversion.productPageViews, conversion.visitors) + " dari pengunjung"}
          />
          <StatCard
            label="Order dibuat"
            value={conversion.ordersCreated.toLocaleString("id-ID")}
            icon={ShoppingBag}
            hint={percent(conversion.ordersCreated, conversion.visitors) + " dari pengunjung"}
          />
          <StatCard
            label="Order dibayar"
            value={conversion.ordersPaid.toLocaleString("id-ID")}
            icon={Coins}
            hint={percent(conversion.ordersPaid, conversion.ordersCreated) + " dari order dibuat"}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Angka pengunjung dan order datang dari dua tabel yang tidak saling terhubung per orang — pakai ini untuk
          melihat tren, bukan sebagai pelacakan satu pembeli dari kunjungan sampai pembayaran.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Produk terlaris (omzet)">
          <RankedBarChart
            data={topProducts.slice(0, 8).map((p) => ({ label: p.productName, value: Number(p.revenue) }))}
            valueLabel="Omzet"
          />
        </Panel>
        <Panel title="Kategori (omzet)">
          <RankedBarChart
            data={byCategory.slice(0, 8).map((c) => ({ label: c.name, value: Number(c.revenue) }))}
            valueLabel="Omzet"
          />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Halaman terpopuler">
          <SimpleTable
            head={["Halaman", "Pageview"]}
            rows={traffic.topPaths.map((p) => [p.path, p.views.toLocaleString("id-ID")])}
          />
        </Panel>
        <Panel title="Sumber kunjungan">
          <SimpleTable
            head={["Perujuk", "Pageview"]}
            rows={traffic.topReferrers.map((r) => [r.host || "Langsung", r.views.toLocaleString("id-ID")])}
          />
        </Panel>
        <Panel title="Perangkat">
          <SimpleTable
            head={["Perangkat", "Pageview"]}
            rows={traffic.devices.map((d) => [
              DEVICE_LABEL[d.device] ?? d.device,
              `${d.views.toLocaleString("id-ID")} · ${percent(d.views, traffic.pageviews)}`,
            ])}
          />
        </Panel>
      </section>

      <Panel title="Metode pembayaran">
        <SimpleTable
          head={["Metode", "Order", "Omzet"]}
          rows={paymentMix.map((m) => [m.method, String(m.orders), formatRupiah(m.revenue)])}
        />
      </Panel>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h, i) => (
            <TableHead key={h} className={i === 0 ? "" : "text-right tabular-nums"}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((cells) => (
          <TableRow key={cells[0]}>
            {cells.map((c, i) => (
              <TableCell key={i} className={i === 0 ? "max-w-[16rem] truncate" : "text-right tabular-nums"}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
