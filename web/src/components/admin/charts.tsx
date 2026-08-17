"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Grafik panel admin.
//
// ===== PALETNYA TERVALIDASI, BUKAN DIPILIH DENGAN MATA =====
//
// Tiga warna deret di bawah lolos seluruh pemeriksaan (pita terang, lantai
// kroma, pemisahan buta warna, lantai penglihatan normal, kontras terhadap
// permukaan) di KEDUA mode. Mode gelap memakai langkah warnanya sendiri, bukan
// hasil pembalikan otomatis - warna terang yang dipakai apa adanya di atas
// permukaan gelap akan menyilaukan dan kontrasnya justru jatuh.
//
// Kalau menambah deret keempat: jalankan ulang validatornya. Kombinasi
// oranye+kuning yang tampak wajar di layar justru gagal ambang penglihatan
// normal, dan itu tidak bisa dilihat dengan cara memandanginya.
const SERIES = {
  light: { primary: "#4f46e5", secondary: "#0e9464", tertiary: "#e05f2a" },
  dark: { primary: "#6f6ae0", secondary: "#199e70", tertiary: "#d95926" },
};

/**
 * Warna dibaca dari CSS custom property, bukan dari `useTheme()`.
 *
 * Alasannya hidrasi: tema disimpan di localStorage dan baru diketahui setelah
 * JavaScript jalan, jadi komponen yang memilih warna dari state React akan
 * merender warna mode terang lebih dulu lalu menukarnya - kedipan yang paling
 * kentara justru di grafik berwarna penuh. CSS variable sudah punya nilai yang
 * benar sejak cat pertama.
 */
function ChartTheme({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-chart w-full">
      {children}
      <style>{`
        .admin-chart {
          --chart-1: ${SERIES.light.primary};
          --chart-2: ${SERIES.light.secondary};
          --chart-3: ${SERIES.light.tertiary};
          --chart-grid: rgba(15, 15, 30, 0.08);
          --chart-ink: rgba(15, 15, 30, 0.55);
          --chart-surface: #ffffff;
          --chart-border: rgba(15, 15, 30, 0.1);
        }
        .dark .admin-chart {
          --chart-1: ${SERIES.dark.primary};
          --chart-2: ${SERIES.dark.secondary};
          --chart-3: ${SERIES.dark.tertiary};
          --chart-grid: rgba(255, 255, 255, 0.1);
          --chart-ink: rgba(255, 255, 255, 0.6);
          --chart-surface: #14141f;
          --chart-border: rgba(255, 255, 255, 0.14);
        }
      `}</style>
    </div>
  );
}

const rupiahShort = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} M`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} jt`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)} rb`;
  return String(v);
};

const rupiahFull = (v: number): string =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

/** Tanggal pendek untuk sumbu: "18 Agu". */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(d)} ${bulan[Number(m) - 1] ?? ""}`;
}

const AXIS_PROPS = {
  stroke: "var(--chart-ink)",
  tick: { fontSize: 11, fill: "var(--chart-ink)" },
  tickLine: false,
  axisLine: false,
} as const;

/** Kotak tooltip dengan gaya yang sama untuk semua grafik. */
function TooltipBox({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; value: string; color: string }[];
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: "var(--chart-surface)",
        border: "1px solid var(--chart-border)",
        color: "inherit",
      }}
    >
      <p className="mb-1 font-medium">{label}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
          <span className="text-muted-foreground">{r.name}</span>
          <span className="ml-auto font-medium">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

interface DailyRow {
  date: string;
  orders: number;
  revenue: number;
  profit: number;
  ordersWithoutCost: number;
}

/**
 * Omzet & laba harian.
 *
 * SATU sumbu untuk dua deret, dan itu wajib: keduanya rupiah, jadi tingginya
 * memang harus bisa dibandingkan langsung. Sumbu ganda akan membuat laba
 * terlihat sejajar omzet hanya karena skalanya berbeda - kesalahan grafik yang
 * paling sering terjadi dan paling menyesatkan.
 */
export function RevenueProfitChart({ data }: { data: DailyRow[] }) {
  const gradId = useId().replace(/:/g, "");
  return (
    <ChartTheme>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={`${gradId}-rev`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`${gradId}-profit`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...AXIS_PROPS} />
          <YAxis tickFormatter={rupiahShort} width={56} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DailyRow;
              return (
                <TooltipBox
                  label={shortDate(String(label))}
                  rows={[
                    { name: "Omzet", value: rupiahFull(row.revenue), color: "var(--chart-1)" },
                    { name: "Laba", value: rupiahFull(row.profit), color: "var(--chart-2)" },
                    { name: "Order", value: String(row.orders), color: "transparent" },
                  ]}
                />
              );
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--chart-ink)" }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Omzet"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill={`url(#${gradId}-rev)`}
          />
          <Area
            type="monotone"
            dataKey="profit"
            name="Laba"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill={`url(#${gradId}-profit)`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartTheme>
  );
}

/** Jumlah order harian. Batang, karena yang dibaca cacah per hari. */
export function OrdersChart({ data }: { data: DailyRow[] }) {
  return (
    <ChartTheme>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} width={40} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DailyRow;
              return (
                <TooltipBox
                  label={shortDate(String(label))}
                  rows={[{ name: "Order", value: String(row.orders), color: "var(--chart-1)" }]}
                />
              );
            }}
          />
          {/* radius hanya di ujung data (atas), menempel ke garis dasar. */}
          <Bar dataKey="orders" name="Order" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartTheme>
  );
}

/** Trafik harian: pageview vs pengunjung unik. */
export function TrafficChart({
  data,
}: {
  data: { date: string; pageviews: number; visitors: number }[];
}) {
  return (
    <ChartTheme>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} width={44} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { pageviews: number; visitors: number };
              return (
                <TooltipBox
                  label={shortDate(String(label))}
                  rows={[
                    { name: "Pageview", value: String(row.pageviews), color: "var(--chart-1)" },
                    { name: "Pengunjung", value: String(row.visitors), color: "var(--chart-3)" },
                  ]}
                />
              );
            }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--chart-ink)" }}
          />
          <Area
            type="monotone"
            dataKey="pageviews"
            name="Pageview"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fillOpacity={0.12}
            fill="var(--chart-1)"
          />
          <Area
            type="monotone"
            dataKey="visitors"
            name="Pengunjung"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fillOpacity={0.12}
            fill="var(--chart-3)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartTheme>
  );
}

/**
 * Peringkat horizontal (produk/kategori terlaris).
 *
 * Batang horizontal, bukan vertikal: nama produk panjang dan miring 45° adalah
 * teks yang harus dibaca sambil memiringkan kepala. Warnanya SATU untuk semua
 * batang - urutan sudah dikodekan oleh panjangnya, dan memberi warna berbeda
 * per batang akan menyiratkan kategori yang sebenarnya tidak ada.
 */
export function RankedBarChart({
  data,
  valueLabel,
}: {
  data: { label: string; value: number }[];
  valueLabel: string;
}) {
  if (data.length === 0) {
    return <p className="px-3 py-10 text-center text-sm text-muted-foreground">Belum ada data.</p>;
  }
  return (
    <ChartTheme>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 24)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" tickFormatter={rupiahShort} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="label" width={130} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: "var(--chart-grid)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { label: string; value: number };
              return (
                <TooltipBox
                  label={row.label}
                  rows={[{ name: valueLabel, value: rupiahFull(row.value), color: "var(--chart-1)" }]}
                />
              );
            }}
          />
          <Bar dataKey="value" name={valueLabel} radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.label} fill="var(--chart-1)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartTheme>
  );
}
