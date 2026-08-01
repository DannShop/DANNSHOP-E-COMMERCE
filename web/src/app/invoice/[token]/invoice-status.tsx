"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FINAL_STATUSES = ["COMPLETED", "FAILED", "EXPIRED", "REFUNDED", "REFUND_PENDING", "NEEDS_REVIEW"];

interface OrderStatusResponse {
  orderNumber: string;
  status: string;
  productName: string;
  itemName: string;
  total: string;
  qrString: string | null;
  snapToken: string | null;
  expiredAt: string | null;
  sn: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Menunggu Pembayaran",
  PAID: "Dibayar",
  PROCESSING: "Diproses",
  COMPLETED: "Berhasil",
  EXPIRED: "Kadaluarsa",
  FAILED: "Gagal",
  REFUND_PENDING: "Menunggu Refund",
  REFUNDED: "Direfund",
  NEEDS_REVIEW: "Sedang Ditinjau",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  PENDING_PAYMENT: "muted",
  PAID: "warning",
  PROCESSING: "warning",
  COMPLETED: "success",
  EXPIRED: "destructive",
  FAILED: "destructive",
  REFUND_PENDING: "destructive",
  REFUNDED: "muted",
  NEEDS_REVIEW: "warning",
};

// Ikon per status — status TIDAK boleh hanya dibedakan lewat warna badge (a11y
// color-not-only), jadi setiap status juga punya ikon + label teks sendiri.
const STATUS_ICON: Record<string, typeof Clock> = {
  PENDING_PAYMENT: Clock,
  PAID: Loader2,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle2,
  EXPIRED: XCircle,
  FAILED: XCircle,
  REFUND_PENDING: Clock,
  REFUNDED: RotateCcw,
  NEEDS_REVIEW: AlertTriangle,
};

const SPINNING_STATUSES = new Set(["PAID", "PROCESSING"]);

export function InvoiceStatus({
  token,
  qrDataUri,
  initial,
}: {
  token: string;
  qrDataUri: string | null;
  initial: OrderStatusResponse;
}) {
  const [copied, setCopied] = useState(false);
  const [snapError, setSnapError] = useState<string | null>(null);
  const { data, isFetching } = useQuery<OrderStatusResponse>({
    queryKey: ["order-status", token],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${token}/status`);
      if (!res.ok) throw new Error("Gagal memuat status order");
      return res.json();
    },
    initialData: initial,
    refetchInterval: (query) => (FINAL_STATUSES.includes(query.state.data?.status ?? "") ? false : 3000),
  });

  const order = data ?? initial;
  const isFinal = FINAL_STATUSES.includes(order.status);
  const StatusIcon = STATUS_ICON[order.status] ?? Clock;

  async function handleCopySn() {
    if (!order.sn) return;
    try {
      await navigator.clipboard.writeText(order.sn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API bisa tidak tersedia (mis. http tanpa TLS) — abaikan diam-diam
    }
  }

  function handleContinuePayment() {
    setSnapError(null);
    if (!order.snapToken) return;
    if (!window.snap) {
      console.error("Snap.js belum termuat, tidak bisa buka popup pembayaran");
      setSnapError("Gagal memuat metode pembayaran. Refresh halaman dan coba lagi.");
      return;
    }
    window.snap.pay(order.snapToken, {
      onError: () => {
        console.error("Snap: transaksi pembayaran gagal", { orderNumber: order.orderNumber });
        setSnapError("Pembayaran gagal diproses. Coba lagi atau pilih metode lain.");
      },
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-muted-foreground">{order.orderNumber}</span>
        <Badge variant={STATUS_VARIANT[order.status] ?? "muted"}>
          <StatusIcon className={cn("size-3", SPINNING_STATUSES.has(order.status) && "animate-spin")} />
          {STATUS_LABEL[order.status] ?? order.status}
        </Badge>
      </div>
      <p className="font-heading text-lg font-bold text-balance">
        {order.productName} · {order.itemName}
      </p>
      <p className="font-heading text-2xl font-bold">
        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
          Number(order.total),
        )}
      </p>

      {!isFinal && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {isFetching ? "Memeriksa status pembayaran…" : "Status diperbarui otomatis setiap beberapa detik"}
        </div>
      )}

      {order.status === "PENDING_PAYMENT" && order.qrString && qrDataUri && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
          <img alt="QRIS pembayaran" src={qrDataUri} width={240} height={240} />
        </div>
      )}

      {order.status === "PENDING_PAYMENT" && order.snapToken && !order.qrString && (
        <>
          {snapError && <p className="text-sm text-danger-foreground">{snapError}</p>}
          <Button onClick={handleContinuePayment} className="h-11 w-full text-base font-heading">
            Lanjutkan Pembayaran
          </Button>
        </>
      )}

      {order.status === "COMPLETED" && order.sn && (
        <div className="rounded-md border border-success-foreground/20 bg-success p-4 text-success-foreground">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Serial Number / Voucher</p>
            <button
              type="button"
              onClick={handleCopySn}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {copied ? (
                <>
                  <Check className="size-3.5" /> Tersalin
                </>
              ) : (
                <>
                  <Copy className="size-3.5" /> Salin
                </>
              )}
            </button>
          </div>
          <p className="mt-1 font-mono text-xl font-bold tracking-wide break-all">{order.sn}</p>
        </div>
      )}
    </div>
  );
}
