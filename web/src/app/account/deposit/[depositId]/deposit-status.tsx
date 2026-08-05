"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  fee: string;
  uniqueCode: number;
  totalPaid: string;
  payment:
    | { kind: "qris"; qrString: string }
    | { kind: "va"; bank: string; vaNumber: string }
    | { kind: "echannel"; billerCode: string; billKey: string }
    | null;
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
}: {
  depositId: string;
  qrDataUri: string | null;
  initial: DepositStatusResponse;
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

      {deposit.status === "PENDING" && deposit.payment?.kind === "qris" && qrDataUri && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
          <img alt="QRIS pembayaran" src={qrDataUri} width={240} height={240} />
        </div>
      )}

      {deposit.status === "PENDING" && deposit.payment?.kind === "va" && (
        <div className="flex flex-col gap-2 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">
            Transfer ke Virtual Account {deposit.payment.bank.toUpperCase()}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xl font-bold tracking-wide">{deposit.payment.vaNumber}</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                const vaNumber = deposit.payment?.kind === "va" ? deposit.payment.vaNumber : "";
                if (vaNumber) void navigator.clipboard.writeText(vaNumber);
              }}
            >
              <Copy className="size-3.5" /> Salin
            </Button>
          </div>
        </div>
      )}

      {deposit.status === "PENDING" && deposit.payment?.kind === "echannel" && (
        <div className="flex flex-col gap-2 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Bayar lewat Mandiri Bill Payment (ATM/Livin&apos;)</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Kode Perusahaan</span>
            <span className="font-mono font-bold">{deposit.payment.billerCode}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Kode Bayar</span>
            <span className="font-mono font-bold">{deposit.payment.billKey}</span>
          </div>
        </div>
      )}

      {deposit.status === "PAID" && (
        <div className="rounded-md border border-success-foreground/20 bg-success p-4 text-success-foreground">
          <p className="text-sm font-semibold">Saldo berhasil ditambahkan!</p>
        </div>
      )}
    </div>
  );
}
