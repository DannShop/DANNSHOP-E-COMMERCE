import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { DEPOSIT_STATUS_LABEL } from "@/lib/order/status-labels";

export const metadata: Metadata = { title: "Riwayat Deposit" };

export default async function AccountDepositsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const deposits = await db.deposit.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      {deposits.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          Belum pernah mengisi saldo.{" "}
          <Link href="/account/deposit" className="text-primary hover:underline">
            Isi saldo sekarang
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {deposits.map((deposit) => (
            <li key={deposit.id}>
              <Link
                href={`/account/deposit/${deposit.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{formatRupiah(deposit.amount)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {formatTanggal(deposit.createdAt)}
                  </span>
                </span>
                <Badge variant="muted">
                  {DEPOSIT_STATUS_LABEL[deposit.status] ?? deposit.status}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
