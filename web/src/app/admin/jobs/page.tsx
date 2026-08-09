import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, parsePage, parsePageSize } from "@/lib/admin/pagination";
import type { JobStatus } from "@prisma/client";

const STATUS_BADGE_VARIANT: Record<JobStatus, "success" | "muted" | "warning" | "destructive"> = {
  DONE: "success",
  PENDING: "muted",
  RUNNING: "warning",
  FAILED: "destructive",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  DONE: "Selesai",
  PENDING: "Menunggu",
  RUNNING: "Berjalan",
  FAILED: "Gagal",
};

const TABS = [
  { key: "all", label: "Semua", status: null },
  { key: "pending", label: "Menunggu", status: "PENDING" as JobStatus },
  { key: "running", label: "Berjalan", status: "RUNNING" as JobStatus },
  { key: "failed", label: "Gagal", status: "FAILED" as JobStatus },
] as const;

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; per?: string }>;
}) {
  const { tab: rawTab, page: rawPage, per } = await searchParams;
  const activeTab = TABS.find((t) => t.key === rawTab) ?? TABS[0];
  const pageSize = parsePageSize(per);

  const where = activeTab.status ? { status: activeTab.status } : {};
  const total = await db.job.count({ where });
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);
  const [jobs, counts] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: { runAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
    db.job.groupBy({ by: ["status"], _count: true }),
  ]);
  const countByStatus = new Map(counts.map((c) => [c.status, c._count]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Monitoring Job/Cron</h1>
          <p className="text-sm text-muted-foreground">
            Job background (sync harga, cek status order, expire order/deposit, cek saldo provider, rollup analytics, dsb).
          </p>
        </div>
        <PageSizeSelect value={pageSize} />
      </div>

      {(countByStatus.get("FAILED") ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {countByStatus.get("FAILED")} job berstatus Gagal — cek detail error di kolom terakhir.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/admin/jobs?tab=${t.key}`}
            className={`rounded px-3 py-1.5 text-sm ${activeTab.key === t.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
          >
            {t.label}
            {t.status && countByStatus.get(t.status) ? ` (${countByStatus.get(t.status)})` : ""}
          </a>
        ))}
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Jadwal Jalan</TableHead>
              <TableHead className="tabular-nums">Percobaan</TableHead>
              <TableHead>Error Terakhir</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Tidak ada job.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-xs">{job.type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {job.runAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {job.attempts}/{job.maxAttempts}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={job.lastError ?? undefined}>
                    {job.lastError ?? "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <Pagination info={pagination} />
      </div>
    </div>
  );
}
