import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// Kartu angka & pemilih rentang tanggal, dipakai BERSAMA oleh dashboard dan
// analytics. Sebelumnya masing-masing halaman punya salinan StatCard-nya
// sendiri dengan gaya yang sudah mulai berbeda - dan dua halaman yang
// menampilkan angka yang sama dengan bentuk berbeda membuat orang mengira
// angkanya juga berbeda.

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  /** "muted" untuk angka pendamping yang tidak boleh menyaingi angka utama. */
  tone?: "default" | "muted";
}) {
  const content = (
    <div className="glass-card group/stat relative h-full overflow-hidden rounded-2xl p-5 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10">
      <div className="flex items-start justify-between gap-3">
        {Icon && (
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-600 ring-1 ring-indigo-500/20 dark:text-indigo-300">
            <Icon className="size-[18px]" />
          </span>
        )}
        {href && (
          <ArrowUpRight
            className="ml-auto size-4 shrink-0 text-muted-foreground/50 transition-[transform,color] duration-300 ease-out group-hover/stat:translate-x-0.5 group-hover/stat:-translate-y-0.5 group-hover/stat:text-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <p className={`${Icon ? "mt-4" : ""} text-xs font-medium tracking-wide text-muted-foreground`}>{label}</p>
      <p
        className={`mt-1 font-heading font-bold tracking-tight tabular-nums ${
          tone === "muted" ? "text-lg" : "text-2xl"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
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

/** Pembungkus panel bergrafik/bertabel, supaya judulnya seragam di dua halaman. */
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export const RANGE_PRESETS = [
  { days: 1, label: "Hari ini" },
  { days: 7, label: "7 hari" },
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
] as const;

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pemilih rentang tanggal.
 *
 * Tautan biasa + form GET, bukan komponen klien: rentangnya hidup di URL, jadi
 * bisa di-bookmark dan dibagikan, dan halamannya tetap Server Component penuh
 * tanpa satu byte JavaScript untuk sesuatu yang cuma mengganti dua angka.
 */
export function RangePicker({
  basePath,
  from,
  to,
  activeDays,
}: {
  basePath: string;
  from: Date;
  to: Date;
  /** Preset yang sedang aktif, kalau rentangnya persis salah satu preset. */
  activeDays: number | null;
}) {
  const now = new Date();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1">
        {RANGE_PRESETS.map((p) => {
          const start = new Date(now.getTime() - (p.days - 1) * 24 * 60 * 60 * 1000);
          const active = activeDays === p.days;
          return (
            <Link
              key={p.days}
              href={`${basePath}?from=${toDateInputValue(start)}&to=${toDateInputValue(now)}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.06] text-foreground/80 hover:bg-foreground/10"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      <form action={basePath} className="flex items-center gap-2">
        <input
          type="date"
          name="from"
          defaultValue={toDateInputValue(from)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          aria-label="Dari tanggal"
        />
        <span className="text-sm text-muted-foreground">s/d</span>
        <input
          type="date"
          name="to"
          defaultValue={toDateInputValue(to)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          aria-label="Sampai tanggal"
        />
        <button
          type="submit"
          className="h-8 rounded-lg bg-foreground/[0.06] px-3 text-sm transition-colors hover:bg-foreground/10"
        >
          Terapkan
        </button>
      </form>
    </div>
  );
}

/**
 * Membaca rentang dari query string, dengan bawaan `defaultDays` terakhir.
 *
 * Dikembalikan bersama `activeDays` supaya tombol preset bisa menyorot dirinya
 * sendiri tanpa halaman menghitung ulang aturan yang sama.
 */
export function resolveRange(
  params: { from?: string; to?: string },
  defaultDays: number,
): { from: Date; to: Date; activeDays: number | null } {
  const now = new Date();
  const endOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  const parsed = (raw: string | undefined): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const to = endOf(parsed(params.to) ?? now);
  const from = startOf(parsed(params.from) ?? new Date(now.getTime() - (defaultDays - 1) * 24 * 60 * 60 * 1000));

  // Selisih hari dihitung dari tanggal lokal, bukan selisih milidetik: pergantian
  // waktu musim panas membuat sebagian hari 23 atau 25 jam, dan pembagian
  // milidetik akan menggeser preset yang seharusnya cocok jadi meleset satu hari.
  const days = Math.round((endOf(to).getTime() - startOf(from).getTime()) / (24 * 60 * 60 * 1000));
  const isToday = toDateInputValue(to) === toDateInputValue(now);
  const activeDays = isToday && RANGE_PRESETS.some((p) => p.days === days) ? days : null;

  return { from, to, activeDays };
}
