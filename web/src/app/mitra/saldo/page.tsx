import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { db } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPartnerSession } from "@/lib/partner/session";

export const metadata: Metadata = { title: "Saldo Mitra" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const DATE_FMT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

const LEDGER_LABEL: Record<string, string> = {
  DEPOSIT: "Isi saldo",
  ORDER_PAYMENT: "Pembayaran transaksi",
  REFUND: "Pengembalian dana",
  ADJUSTMENT: "Penyesuaian admin",
  MEMBERSHIP: "Pembelian tier",
};

export default async function MitraBalancePage() {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const wallet = await db.wallet.findUnique({
    where: { userId: partner.userId },
    select: { id: true, balance: true },
  });

  const ledger = wallet
    ? await db.walletLedger.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE,
      })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <section className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6">
        <div>
          <p className="text-xs text-muted-foreground">Saldo tersedia</p>
          <p className="font-heading text-3xl font-bold tabular-nums">{formatRupiah(Number(wallet?.balance ?? 0n))}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Angka ini sama persis dengan yang dikembalikan{" "}
            <code className="rounded bg-foreground/10 px-1">POST /api/v1/cek-saldo</code>.
          </p>
        </div>
        {/* Isi saldo TIDAK diduplikasi di portal ini. Alur QRIS/VA + settlement +
            ledger idempoten yang ada di /account/deposit sudah teruji di jalur
            uang yang sama; membuat jalur top-up kedua berarti menulis ulang
            mesin uang yang tidak akan pernah dites sekeras yang pertama. */}
        <Link href="/account/deposit" className={cn(buttonVariants({ size: "lg" }))}>
          <PlusCircle className="size-4" aria-hidden="true" />
          Isi Saldo
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-bold">Mutasi Terakhir</h2>
        {ledger.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Belum ada mutasi saldo.
          </p>
        ) : (
          <div className="glass-card overflow-hidden rounded-2xl">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="bg-foreground/[0.03] text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Jenis</th>
                    <th className="px-4 py-2.5 font-medium">Keterangan</th>
                    <th className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                    <th className="px-4 py-2.5 text-right font-medium">Saldo Akhir</th>
                    <th className="px-4 py-2.5 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => {
                    const amount = Number(row.amount);
                    return (
                      <tr key={row.id} className="border-t border-border/40">
                        <td className="px-4 py-2.5">
                          <Badge variant={amount >= 0 ? "success" : "muted"}>
                            {LEDGER_LABEL[row.type] ?? row.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {row.note ?? `${row.referenceType} ${row.referenceId}`}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2.5 text-right font-medium tabular-nums",
                            amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                          )}
                        >
                          {amount >= 0 ? "+" : "−"}
                          {formatRupiah(Math.abs(amount))}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatRupiah(Number(row.balanceAfter))}
                        </td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                          {DATE_FMT.format(row.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Menampilkan {PAGE_SIZE} mutasi terakhir. Riwayat lengkap ada di{" "}
          <Link href="/account" className="font-medium text-primary underline-offset-4 hover:underline">
            panel akun
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
