"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Eye, ShoppingBag, Coins } from "lucide-react";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { Badge } from "@/components/ui/badge";

interface LiveData {
  onlineNow: number;
  pageviewsLastHour: number;
  ordersLastHour: number;
  revenueLastHour: string;
  recentPaths: { path: string; views: number }[];
  recentOrders: {
    orderNumber: string;
    productName: string;
    itemName: string;
    total: string;
    status: string;
    createdAt: string;
  }[];
  generatedAt: string;
}

const POLL_MS = 10_000;

function rupiah(value: string | number): string {
  return `Rp${Number(value).toLocaleString("id-ID")}`;
}

function LiveStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-300">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function LivePanel() {
  const { data, isFetching, isError } = useQuery<LiveData>({
    queryKey: ["analytics-live"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/live");
      if (!res.ok) throw new Error("Gagal memuat data langsung");
      return res.json();
    },
    refetchInterval: POLL_MS,
    // Polling dihentikan saat tab tidak terlihat. Tanpa ini, panel yang lupa
    // ditutup semalaman terus memanggil endpoint tiap 10 detik tanpa ada yang
    // membacanya - itu murni tagihan compute dan beban query DB sia-sia.
    refetchIntervalInBackground: false,
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Langsung
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {isError
            ? "Gagal memuat — mencoba lagi otomatis"
            : isFetching
              ? "Memperbarui…"
              : data
                ? `Diperbarui ${new Date(data.generatedAt).toLocaleTimeString("id-ID")}`
                : "Memuat…"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LiveStat label="Online sekarang (5 mnt)" value={String(data?.onlineNow ?? 0)} icon={Users} />
        <LiveStat label="Pageview 1 jam" value={String(data?.pageviewsLastHour ?? 0)} icon={Eye} />
        <LiveStat label="Order 1 jam" value={String(data?.ordersLastHour ?? 0)} icon={ShoppingBag} />
        <LiveStat label="Omzet 1 jam" value={rupiah(data?.revenueLastHour ?? 0)} icon={Coins} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl ring-1 ring-foreground/10">
          <p className="border-b px-3 py-2 text-sm font-semibold">Halaman aktif (1 jam terakhir)</p>
          <ul className="divide-y">
            {(data?.recentPaths ?? []).length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada kunjungan.</li>
            ) : (
              data!.recentPaths.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="truncate font-mono text-xs">{p.path}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{p.views}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl ring-1 ring-foreground/10">
          <p className="border-b px-3 py-2 text-sm font-semibold">Order terbaru</p>
          <ul className="divide-y">
            {(data?.recentOrders ?? []).length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada order.</li>
            ) : (
              data!.recentOrders.map((o) => (
                <li key={o.orderNumber} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.orderNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.productName} · {o.itemName}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums">{rupiah(o.total)}</span>
                    <Badge variant="muted">{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
