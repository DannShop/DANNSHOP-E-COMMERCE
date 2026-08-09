import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DateRangeFilter, PageSizeSelect, Pagination } from "@/components/admin/table-toolbar";
import { buildPagination, createdAtFilter, parseDateRange, parsePage, parsePageSize } from "@/lib/admin/pagination";
import type { LedgerType } from "@prisma/client";

const TYPE_LABEL: Record<LedgerType, string> = {
  DEPOSIT: "Deposit",
  ORDER_PAYMENT: "Bayar Order",
  REFUND: "Refund",
  ADJUSTMENT: "Penyesuaian",
  MEMBERSHIP: "Beli Tier",
};

const TYPE_BADGE_VARIANT: Record<LedgerType, "success" | "muted" | "warning"> = {
  DEPOSIT: "success",
  ORDER_PAYMENT: "muted",
  REFUND: "warning",
  ADJUSTMENT: "warning",
  MEMBERSHIP: "muted",
};

const TABS = [
  { key: "all", label: "Semua", type: null },
  { key: "deposit", label: "Deposit", type: "DEPOSIT" as LedgerType },
  { key: "order_payment", label: "Bayar Order", type: "ORDER_PAYMENT" as LedgerType },
  { key: "membership", label: "Beli Tier", type: "MEMBERSHIP" as LedgerType },
  { key: "refund", label: "Refund", type: "REFUND" as LedgerType },
  { key: "adjustment", label: "Penyesuaian", type: "ADJUSTMENT" as LedgerType },
] as const;

function formatRupiah(amount: bigint): string {
  const sign = amount < 0n ? "-" : "+";
  const abs = amount < 0n ? -amount : amount;
  return `${sign}${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(abs))}`;
}

export default async function AdminWalletLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string; per?: string; from?: string; to?: string }>;
}) {
  const { tab: rawTab, q, page: rawPage, per, from: rawFrom, to: rawTo } = await searchParams;
  const activeTab = TABS.find((t) => t.key === rawTab) ?? TABS[0];
  const pageSize = parsePageSize(per);

  const where = {
    ...(activeTab.type ? { type: activeTab.type } : {}),
    ...(q ? { wallet: { user: { email: { contains: q } } } } : {}),
    ...createdAtFilter(parseDateRange(rawFrom, rawTo)),
  };
  const total = await db.walletLedger.count({ where });
  const pagination = buildPagination(total, parsePage(rawPage), pageSize);
  const entries = await db.walletLedger.findMany({
    where,
    include: { wallet: { include: { user: { select: { email: true } } } } },
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.pageSize,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Mutasi Saldo</h1>
        <p className="text-sm text-muted-foreground">Riwayat semua pergerakan saldo wallet member.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`/admin/wallet-ledger?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded px-3 py-1.5 text-sm ${activeTab.key === t.key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
            >
              {t.label}
            </a>
          ))}
        </div>
        <form action="/admin/wallet-ledger" className="flex gap-2">
          <input type="hidden" name="tab" value={activeTab.key} />
          <Input name="q" defaultValue={q ?? ""} placeholder="Cari email member" className="w-56" />
          <Button type="submit" variant="outline">Cari</Button>
        </form>
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
              <TableHead>Member</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="tabular-nums">Jumlah</TableHead>
              <TableHead className="tabular-nums">Saldo Setelah</TableHead>
              <TableHead>Referensi</TableHead>
              <TableHead>Catatan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Tidak ada mutasi.
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {entry.createdAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell>{entry.wallet.user.email}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_BADGE_VARIANT[entry.type]}>{TYPE_LABEL[entry.type]}</Badge>
                  </TableCell>
                  <TableCell className={`tabular-nums font-medium ${entry.amount < 0n ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
                    {formatRupiah(entry.amount)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(entry.balanceAfter))}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {entry.referenceType}:{entry.referenceId}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.note ?? "-"}</TableCell>
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
