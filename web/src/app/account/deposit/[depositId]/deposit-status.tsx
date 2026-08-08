"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PaymentInstructions } from "@/components/payment/payment-instructions";
import type { SnapBrowserConfig } from "@/lib/payment/gateway-config";
import type { PaymentActions } from "@/lib/midtrans/client";

const FINAL_STATUSES = ["PAID", "FAILED", "EXPIRED"];

function formatRupiah(amount: string | number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

interface DepositStatusResponse {
  depositId: string;
  status: string;
  amount: string;
  bonusAmount: string;
  fee: string;
  uniqueCode: number;
  totalPaid: string;
  payment: PaymentActions | null;
  expiredAt: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Pembayaran",
  PAID: "Berhasil",
  EXPIRED: "Kadaluarsa",
  FAILED: "Gagal",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  PENDING: "warning",
  PAID: "success",
  EXPIRED: "destructive",
  FAILED: "destructive",
};

const STATUS_ICON: Record<string, typeof Clock> = {
  PENDING: Clock,
  PAID: CheckCircle2,
  EXPIRED: XCircle,
  FAILED: XCircle,
};

export function DepositStatus({
  depositId,
  qrDataUri,
  initial,
  snapConfig,
}: {
  depositId: string;
  qrDataUri: string | null;
  initial: DepositStatusResponse;
  snapConfig?: SnapBrowserConfig | null;
}) {
  const { data, isFetching } = useQuery<DepositStatusResponse>({
    queryKey: ["deposit-status", depositId],
    queryFn: async () => {
      const res = await fetch(`/api/deposits/${depositId}/status`);
      if (!res.ok) throw new Error("Gagal memuat status deposit");
      return res.json();
    },
    initialData: initial,
    refetchInterval: (query) => (FINAL_STATUSES.includes(query.state.data?.status ?? "") ? false : 3000),
  });

  const deposit = data ?? initial;
  const isFinal = FINAL_STATUSES.includes(deposit.status);
  const StatusIcon = STATUS_ICON[deposit.status] ?? Clock;

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Isi Saldo</span>
        <Badge variant={STATUS_VARIANT[deposit.status] ?? "muted"}>
          <StatusIcon className={cn("size-3", deposit.status === "PENDING" && "animate-spin")} />
          {STATUS_LABEL[deposit.status] ?? deposit.status}
        </Badge>
      </div>
      <p className="font-heading text-2xl font-bold">{formatRupiah(deposit.totalPaid)}</p>

      <div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Nominal isi saldo</span>
          <span>{formatRupiah(deposit.amount)}</span>
        </div>
        {Number(deposit.bonusAmount) > 0 && (
          <div className="flex justify-between text-primary">
            <span>Bonus tier member</span>
            <span>+{formatRupiah(deposit.bonusAmount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Biaya admin</span>
          <span>{formatRupiah(deposit.fee)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Kode unik</span>
          <span>{formatRupiah(deposit.uniqueCode)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
          <span>Total Bayar</span>
          <span>{formatRupiah(deposit.totalPaid)}</span>
        </div>
      </div>

      {!isFinal && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {isFetching ? "Memeriksa status pembayaran…" : "Status diperbarui otomatis setiap beberapa detik"}
        </div>
      )}

      {deposit.status === "PENDING" && (
        <PaymentInstructions payment={deposit.payment} qrDataUri={qrDataUri} snapConfig={snapConfig} />
      )}

      {deposit.status === "PAID" && (
        <div className="rounded-md border border-success-foreground/20 bg-success p-4 text-success-foreground">
          <p className="text-sm font-semibold">Saldo berhasil ditambahkan!</p>
        </div>
      )}
    </div>
  );
}
