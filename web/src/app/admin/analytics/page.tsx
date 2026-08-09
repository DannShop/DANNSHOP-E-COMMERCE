import { getTrafficSummary, getConversionSummary } from "@/lib/analytics/query";
import { startOfDay, endOfDay } from "@/lib/reports/sales";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LivePanel } from "./live-panel";

export const dynamic = "force-dynamic";

const RANGE_PRESETS = [
  { key: "7", label: "7 hari" },
  { key: "30", label: "30 hari" },
  { key: "90", label: "90 hari" },
] as const;

const DEVICE_LABEL: Record<string, string> = { mobile: "Ponsel", tablet: "Tablet", desktop: "Desktop" };

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Grafik batang murni CSS - tidak menarik pustaka charting apa pun.
//
// Yang dibutuhkan di sini cuma perbandingan tinggi antar-hari. Menambah
// dependensi charting berarti puluhan kilobyte JavaScript ke bundle admin
// untuk sesuatu yang bisa dikerjakan flexbox, dan tetap harus dirawat saat
// versi mayornya berganti.
function DailyBars({ daily }: { daily: { date: string; pageviews: number; visitors: number }[] }) {
  const max = Math.max(1, ...daily.map((d) => d.pageviews));
  if (daily.length === 0) {
    return <p className="px-3 py-8 text-center text-sm text-muted-foreground">Belum ada data kunjungan.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-full items-end gap-1 px-3 pt-4 pb-2" style={{ height: 180 }}>
        {daily.map((d) => (
          <div key={d.date} className="group/bar flex min-w-3 flex-1 flex-col items-center justify-end gap-1">
            <span className="pointer-events-none text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover/bar:opacity-100">
              {d.pageviews}
            </span>
            <div
              className="w-full rounded-t bg-gradient-to-t from-indigo-500/40 to-violet-500/70 transition-opacity hover:opacity-80"
              style={{ height: `${Math.max(2, (d.pageviews / max) * 130)}px` }}
              title={`${d.date} — ${d.pageviews} pageview, ${d.visitors} pengunjung`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between px-3 pb-3 text-[10px] text-muted-foreground">
        <span>{daily[0]?.date}</span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: rawFrom, to: rawTo } = await searchParams;
  const now = new Date();
  const to = rawTo ? endOfDay(new Date(rawTo)) : endOfDay(now);
  const from = rawFrom ? startOfDay(new Date(rawFrom)) : startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

  const [traffic, conversion] = await Promise.all([getTrafficSummary(from, to), getConversionSummary(from, to)]);
  const totalDeviceViews = traffic.devices.reduce((sum, d) => sum + d.views, 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Trafik pengunjung dan konversi ke transaksi. Panel &quot;Langsung&quot; di bawah memperbarui dirinya sendiri
          tiap 10 detik tanpa perlu me-refresh browser — sisanya pakai tombol refresh di header.
        </p>
      </div>

      <LivePanel />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold tracking-wide">Rekap</h2>
          <div className="flex gap-1">
            {RANGE_PRESETS.map((p) => (
              <a
                key={p.key}
                href={`/admin/analytics?from=${toDateInputValue(new Date(now.getTime() - (Number(p.key) - 1) * 24 * 60 * 60 * 1000))}&to=${toDateInputValue(now)}`}
                className="rounded bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
              >
                {p.label}
              </a>
            ))}
          </div>
          <form action="/admin/analytics" className="flex items-center gap-2">
            <Input type="date" name="from" defaultValue={toDateInputValue(from)} className="h-8 w-36 text-sm" />
            <span className="text-xs text-muted-foreground">s/d</span>
            <Input type="date" name="to" defaultValue={toDateInputValue(to)} className="h-8 w-36 text-sm" />
            <Button type="submit" variant="outline" size="sm">
              Terapkan
            </Button>
          </form>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pageview" value={traffic.pageviews.toLocaleString("id-ID")} />
          <StatCard
            label="Pengunjung"
            value={traffic.visitors.toLocaleString("id-ID")}
            hint="Dihitung ulang tiap hari"
          />
          <StatCard label="Sesi kunjungan" value={traffic.sessions.toLocaleString("id-ID")} />
          <StatCard
            label="Halaman per sesi"
            value={traffic.sessions > 0 ? (traffic.pageviews / traffic.sessions).toFixed(1) : "—"}
          />
        </div>

        {/* Peringatan ini penting: angka "pengunjung" untuk rentang berhari-hari
            BUKAN jumlah orang berbeda. Identitas pengunjung sengaja diacak ulang
            tiap hari demi privasi, jadi satu orang yang datang tiga hari
            terhitung tiga kali. Tanpa keterangan ini, admin akan salah membaca
            angkanya sebagai jangkauan audiens. */}
        <p className="rounded-lg border-l-2 border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Cara baca angka pengunjung:</strong> identitas pengunjung diacak ulang
          setiap hari (kami tidak menyimpan IP), jadi angka pengunjung akurat untuk rentang <em>satu hari</em>. Untuk
          rentang beberapa hari, satu orang yang datang berkali-kali di hari berbeda ikut terhitung berkali-kali.
          {traffic.partialFromRollup &&
            " Sebagian rentang ini diambil dari ringkasan harian karena data mentahnya sudah melewati masa simpan 30 hari."}
        </p>

        <div className="rounded-xl ring-1 ring-foreground/10">
          <p className="border-b px-3 py-2 text-sm font-semibold">Pageview per hari</p>
          <DailyBars daily={traffic.daily} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide">Corong Kunjungan → Transaksi</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Pengunjung" value={conversion.visitors.toLocaleString("id-ID")} />
          <StatCard
            label="Buka halaman produk"
            value={conversion.productPageViews.toLocaleString("id-ID")}
            hint={percent(conversion.productPageViews, conversion.visitors) + " dari pengunjung"}
          />
          <StatCard
            label="Order dibuat"
            value={conversion.ordersCreated.toLocaleString("id-ID")}
            hint={percent(conversion.ordersCreated, conversion.productPageViews) + " dari kunjungan produk"}
          />
          <StatCard
            label="Order dibayar"
            value={conversion.ordersPaid.toLocaleString("id-ID")}
            hint={percent(conversion.ordersPaid, conversion.ordersCreated) + " dari order dibuat"}
          />
          <StatCard label="Omzet" value={formatRupiah(conversion.revenue)} />
          <StatCard label="Member baru" value={conversion.newUsers.toLocaleString("id-ID")} />
        </div>
        <p className="text-xs text-muted-foreground">
          Kunjungan dan order berasal dari dua sumber data yang tidak saling terhubung, jadi persentase di atas adalah
          rasio kasar untuk melihat tren naik-turun — bukan pelacakan satu orang dari kunjungan sampai pembayaran.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl ring-1 ring-foreground/10 lg:col-span-2">
          <p className="border-b px-3 py-2 text-sm font-semibold">Halaman Terpopuler</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Halaman</TableHead>
                <TableHead className="text-right tabular-nums">Pageview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {traffic.topPaths.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-6 text-center text-muted-foreground">
                    Belum ada data.
                  </TableCell>
                </TableRow>
              ) : (
                traffic.topPaths.map((p) => (
                  <TableRow key={p.path}>
                    <TableCell className="font-mono text-xs">{p.path}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.views.toLocaleString("id-ID")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl ring-1 ring-foreground/10">
            <p className="border-b px-3 py-2 text-sm font-semibold">Perangkat</p>
            <ul className="divide-y">
              {traffic.devices.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada data.</li>
              ) : (
                traffic.devices.map((d) => (
                  <li key={d.device} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{DEVICE_LABEL[d.device] ?? d.device}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {d.views.toLocaleString("id-ID")} · {percent(d.views, totalDeviceViews)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl ring-1 ring-foreground/10">
            <p className="border-b px-3 py-2 text-sm font-semibold">Sumber Rujukan</p>
            <ul className="divide-y">
              {traffic.topReferrers.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Belum ada rujukan dari luar — pengunjung datang langsung.
                </li>
              ) : (
                traffic.topReferrers.map((r) => (
                  <li key={r.host} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">{r.host}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{r.views}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
