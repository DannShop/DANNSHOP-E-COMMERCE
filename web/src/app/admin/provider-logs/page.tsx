import Link from "next/link";
import type { Prisma, ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { ProviderApiLogEntryCard } from "@/components/admin/provider-api-log-entry";
import { PROVIDER_API_FAILURE_OUTCOMES } from "@/lib/providers/api-log";

// Riwayat panggilan API provider LINTAS order.
//
// Halaman detail order hanya menjawab "kenapa order INI gagal". Yang jauh lebih
// menentukan biasanya pertanyaan berikutnya: apakah cuma order ini, atau semua
// order sedang gagal karena sebab yang sama? Filter "Gagal saja" di sini menjawab
// itu dalam sekali lihat - termasuk kegagalan yang TIDAK terikat order sama sekali
// (sync harga, cek saldo), yang justru paling sering jadi peringatan dini bahwa
// kredensial/whitelist IP-nya yang bermasalah.

const PROVIDERS = ["all", "DIGIFLAZZ", "OKECONNECT", "QIOSPAY", "SERPUL"] as const;
const STATUS_FILTERS = [
  { value: "all", label: "Semua" },
  { value: "failed", label: "Gagal saja" },
  { value: "SUCCESS", label: "Berhasil" },
  { value: "PENDING", label: "Menunggu" },
  { value: "REJECTED", label: "Ditolak provider" },
  { value: "TRANSPORT_ERROR", label: "Tidak sampai" },
  { value: "INVALID_RESPONSE", label: "Respons tidak terbaca" },
] as const;

function FilterLinks({
  options,
  active,
  buildHref,
}: {
  options: readonly { value: string; label: string }[];
  active: string;
  buildHref: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Link
          key={o.value}
          href={buildHref(o.value)}
          className={`rounded px-3 py-1.5 text-sm ${
            active === o.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export default async function AdminProviderLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; status?: string; q?: string }>;
}) {
  const { provider: rawProvider, status: rawStatus, q: rawQ } = await searchParams;
  const provider = PROVIDERS.includes(rawProvider as (typeof PROVIDERS)[number])
    ? (rawProvider as (typeof PROVIDERS)[number])
    : "all";
  const status = STATUS_FILTERS.some((s) => s.value === rawStatus) ? rawStatus! : "all";
  const q = (rawQ ?? "").trim();

  const where: Prisma.ProviderApiLogWhereInput = {
    ...(provider === "all" ? {} : { provider: provider as ProviderKey }),
    ...(status === "all"
      ? {}
      : status === "failed"
        ? { outcome: { in: PROVIDER_API_FAILURE_OUTCOMES } }
        : { outcome: status }),
    ...(q ? { OR: [{ orderNumber: { contains: q } }, { ourRefId: { contains: q } }, { message: { contains: q } }] } : {}),
  };

  const logs = await db.providerApiLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });

  const buildHref = (next: { provider?: string; status?: string }) => {
    const sp = new URLSearchParams();
    const p = next.provider ?? provider;
    const s = next.status ?? status;
    if (p !== "all") sp.set("provider", p);
    if (s !== "all") sp.set("status", s);
    if (q) sp.set("q", q);
    const qs = sp.toString();
    return qs ? `/admin/provider-logs?${qs}` : "/admin/provider-logs";
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Log API Provider</h1>
        <p className="text-sm text-muted-foreground">
          Semua panggilan KELUAR ke API provider — request, respons mentah, status HTTP, dan durasi. Dipakai buat
          menjawab kenapa sebuah order gagal, dan apakah sebabnya cuma order itu atau menimpa semuanya.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <FilterLinks
          options={PROVIDERS.map((p) => ({ value: p, label: p === "all" ? "Semua provider" : p }))}
          active={provider}
          buildHref={(value) => buildHref({ provider: value })}
        />
        <FilterLinks options={STATUS_FILTERS} active={status} buildHref={(value) => buildHref({ status: value })} />
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        {provider !== "all" && <input type="hidden" name="provider" value={provider} />}
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Cari nomor order, ref id, atau pesan provider…"
          className="min-w-64 flex-1 rounded border bg-background px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Cari
        </button>
      </form>

      {logs.length === 0 ? (
        <p className="rounded-xl px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          Tidak ada panggilan yang cocok dengan filter ini.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <ProviderApiLogEntryCard key={log.id} log={log} showOrder />
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Menampilkan maksimal 100 panggilan terbaru. Log berumur lebih dari 30 hari dibersihkan otomatis oleh job{" "}
        <span className="font-mono">cleanup-provider-api-logs</span>. Data lengkap dalam bentuk JSON tersedia di{" "}
        <span className="font-mono">/api/admin/provider-logs</span>.
      </p>
    </div>
  );
}
