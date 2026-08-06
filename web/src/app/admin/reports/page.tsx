import { getSalesSummary, startOfDay, endOfDay } from "@/lib/reports/sales";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(amount));
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const RANGE_PRESETS = [
  { key: "7", label: "7 hari" },
  { key: "30", label: "30 hari" },
  { key: "90", label: "90 hari" },
] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: rawFrom, to: rawTo } = await searchParams;
  const now = new Date();
  const to = rawTo ? endOfDay(new Date(rawTo)) : endOfDay(now);
  const from = rawFrom ? startOfDay(new Date(rawFrom)) : startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));

  const summary = await getSalesSummary(from, to);
  const avgOrder = summary.orderCount > 0 ? summary.totalRevenue / BigInt(summary.orderCount) : 0n;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Laporan Penjualan</h1>
        <p className="text-sm text-muted-foreground">
          Omzet dihitung dari order yang sudah dibayar (Dibayar/Diproses/Berhasil/Ditinjau/Menunggu Refund) — tidak
          termasuk yang belum dibayar atau sudah direfund penuh.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {RANGE_PRESETS.map((p) => (
            <a
              key={p.key}
              href={`/admin/reports?from=${toDateInputValue(new Date(now.getTime() - (Number(p.key) - 1) * 24 * 60 * 60 * 1000))}&to=${toDateInputValue(now)}`}
              className="rounded bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
            >
              {p.label}
            </a>
          ))}
        </div>
        <form action="/admin/reports" className="flex items-center gap-2">
          <Input type="date" name="from" defaultValue={toDateInputValue(from)} className="w-40" />
          <span className="text-sm text-muted-foreground">s/d</span>
          <Input type="date" name="to" defaultValue={toDateInputValue(to)} className="w-40" />
          <Button type="submit" variant="outline">Terapkan</Button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Total Omzet</p>
          <p className="font-heading text-2xl font-bold">{formatRupiah(summary.totalRevenue)}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Jumlah Order</p>
          <p className="font-heading text-2xl font-bold">{summary.orderCount}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Rata-rata per Order</p>
          <p className="font-heading text-2xl font-bold">{formatRupiah(avgOrder)}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl ring-1 ring-foreground/10">
          <p className="border-b px-3 py-2 text-sm font-semibold">Berdasarkan Status</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="tabular-nums">Order</TableHead>
                <TableHead className="tabular-nums">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.byStatus.map((row) => (
                <TableRow key={row.status}>
                  <TableCell>{ORDER_STATUS_LABEL[row.status] ?? row.status}</TableCell>
                  <TableCell className="tabular-nums">{row.count}</TableCell>
                  <TableCell className="tabular-nums">{formatRupiah(row.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-xl ring-1 ring-foreground/10">
          <p className="border-b px-3 py-2 text-sm font-semibold">Produk Terlaris</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead className="tabular-nums">Order</TableHead>
                <TableHead className="tabular-nums">Omzet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.topProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    Belum ada data.
                  </TableCell>
                </TableRow>
              ) : (
                summary.topProducts.map((p) => (
                  <TableRow key={p.productName}>
                    <TableCell>{p.productName}</TableCell>
                    <TableCell className="tabular-nums">{p.count}</TableCell>
                    <TableCell className="tabular-nums">{formatRupiah(p.revenue)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
