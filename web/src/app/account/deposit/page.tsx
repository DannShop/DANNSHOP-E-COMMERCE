import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, History } from "lucide-react";
import { db } from "@/lib/db";
import { DepositForm } from "./deposit-form";
import { StorefrontSlot } from "@/components/storefront-slot";

export const metadata: Metadata = { title: "Isi Saldo" };

// Pengecekan sesi tidak ditulis di sini: account/layout.tsx sudah menolak
// pengunjung yang belum login untuk SELURUH /account. Sebelum layout itu ada,
// halaman ini justru satu-satunya di panel yang tidak memeriksa sesi sama sekali.
export default async function DepositPage() {
  const paymentMethods = await db.paymentMethodConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <StorefrontSlot name="deposit_note" className="rounded-lg border p-3 text-sm" />
      <DepositForm
        paymentMethods={paymentMethods.map((m) => ({
          code: m.code,
          label: m.label,
          logoUrl: m.logoUrl,
          feeFlat: m.feeFlat.toString(),
          feePercent: m.feePercent,
        }))}
      />

      {/* Jalan ke riwayat. Di HP, tab "Deposit" mengarah ke halaman INI, jadi
          tanpa tautan ini riwayat mutasi saldo kehilangan satu-satunya pintu
          masuknya di mobile. Di desktop tautan ini tetap berguna sebagai jalan
          pintas, walau sidebar sudah punya menunya sendiri. */}
      <Link
        href="/account/deposits"
        className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-5 py-4 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <History className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Riwayat isi saldo</span>
            <span className="block text-xs text-muted-foreground">
              Lihat semua pengisian saldo dan statusnya.
            </span>
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </div>
  );
}
