import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangeFilter, PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, createdAtFilter, parseDateRange, parsePage, parsePageSize } from "@/lib/admin/pagination";

const SOURCES = ["all", "midtrans", "digiflazz", "okeconnect", "qiospay", "serpul"] as const;

export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; page?: string; per?: string; from?: string; to?: string }>;
}) {
  const { source: rawSource, page: rawPage, per, from: rawFrom, to: rawTo } = await searchParams;
  const activeSource = SOURCES.includes(rawSource as (typeof SOURCES)[number]) ? (rawSource as (typeof SOURCES)[number]) : "all";
  const pageSize = parsePageSize(per);

  const where = {
    ...(activeSource === "all" ? {} : { source: activeSource }),
    ...createdAtFilter(parseDateRange(rawFrom, rawTo)),
  };
  const total = await db.webhookEvent.count({ where });
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);
  const events = await db.webhookEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
      <h1 className="text-xl font-semibold">Log Callback/Webhook</h1>
      <p className="text-sm text-muted-foreground">
        Semua notifikasi masuk dari Midtrans dan provider — buat lacak pembayaran/status yang sepertinya tidak
        nyambung.
      </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <a
            key={s}
            href={`/admin/webhooks?source=${s}`}
            className={`rounded px-3 py-1.5 text-sm capitalize ${activeSource === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
          >
            {s}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter from={rawFrom ?? ""} to={rawTo ?? ""} />
        <PageSizeSelect value={pageSize} />
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Sumber</TableHead>
              <TableHead>Ref Eksternal</TableHead>
              <TableHead>Hasil</TableHead>
              <TableHead>Isi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Belum ada callback masuk.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {event.createdAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted" className="capitalize">
                      {event.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{event.externalRef ?? "-"}</TableCell>
                  <TableCell>
                    {event.processedAt ? (
                      <Badge variant="success">{event.processResult ?? "diproses"}</Badge>
                    ) : (
                      <Badge variant="warning">belum diproses</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <details className="max-w-md">
                      <summary className="cursor-pointer text-xs text-primary hover:underline">Lihat raw body</summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">{event.rawBody}</pre>
                    </details>
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
