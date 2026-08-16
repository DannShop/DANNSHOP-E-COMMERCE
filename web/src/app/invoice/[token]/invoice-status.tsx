"use client";

import { useActionState, useState } from "react";
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
  MessageCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PaymentInstructions } from "@/components/payment/payment-instructions";
import type { SnapBrowserConfig } from "@/lib/payment/gateway-config";
import type { PaymentActions } from "@/lib/midtrans/client";
import { cancelOrderByToken, type CancelResult } from "@/app/actions/order-lookup";

const FINAL_STATUSES = ["COMPLETED", "FAILED", "EXPIRED", "REFUNDED", "REFUND_PENDING", "NEEDS_REVIEW"];

/**
 * Tombol batalkan, ditaruh DI BAWAH instruksi bayar dan sengaja dibuat tidak
 * menonjol.
 *
 * Yang dibatalkan pembeli sendiri hanya pesanan yang belum dibayar - begitu
 * uangnya masuk, yang berlaku adalah refund lewat admin, bukan pembatalan
 * sepihak. Gerbang itu ditegakkan di server (cancelPendingOrder), bukan dengan
 * menyembunyikan tombolnya.
 *
 * Konfirmasi dua langkah, bukan langsung batal: tombol ini bertetangga dengan
 * tombol bayar, dan salah pencet di layar HP berarti QRIS yang sudah dibuka
 * mendadak mati.
 */
function CancelOrderButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(cancelOrderByToken, {} as CancelResult);
  const [confirming, setConfirming] = useState(false);

  // Pembatalan yang sukses membuat polling status di atas menarik status
  // barunya sendiri, jadi tidak ada yang perlu ditulis ulang di sini.
  if (state.ok) {
    return <p className="text-center text-xs text-muted-foreground">{state.ok}</p>;
  }

  if (!confirming) {
    return (
      <div className="text-center">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Batalkan pesanan ini
        </button>
        {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-center gap-2">
      <input type="hidden" name="publicToken" value={token} />
      <p className="text-center text-xs text-muted-foreground">
        Batalkan pesanan ini? Kode pembayarannya langsung tidak berlaku lagi.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-foreground/15 hover:bg-muted"
        >
          Tidak jadi
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {pending ? "Membatalkan…" : "Ya, batalkan"}
        </button>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

function formatRupiah(amount: string | number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

interface OrderStatusResponse {
  orderNumber: string;
  status: string;
  productName: string;
  itemName: string;
  sellingPrice: string;
  /** Potongan kode promo. "0" = tidak memakai promo. */
  discount: string;
  voucherCode: string | null;
  fee: string;
  uniqueCode: number;
  total: string;
  payment: PaymentActions | null;
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
  snapConfig,
}: {
  token: string;
  qrDataUri: string | null;
  initial: OrderStatusResponse;
  snapConfig?: SnapBrowserConfig | null;
}) {
  const [copied, setCopied] = useState(false);
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
      <p className="font-heading text-2xl font-bold">{formatRupiah(order.total)}</p>

      <div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Harga item</span>
          <span>{formatRupiah(order.sellingPrice)}</span>
        </div>
        {/* Baris potongan hanya muncul kalau ada. Tanpanya, pembeli yang
            memakai kode promo melihat total yang tidak cocok dengan
            penjumlahan baris di atasnya - dan selisih tanpa penjelasan pada
            angka tagihan adalah hal pertama yang dilaporkan ke CS. */}
        {order.discount !== "0" && (
          <div className="flex justify-between">
            <span className="min-w-0 truncate text-muted-foreground">
              Promo{order.voucherCode ? ` ${order.voucherCode}` : ""}
            </span>
            <span className="text-primary">−{formatRupiah(order.discount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Biaya admin</span>
          <span>{formatRupiah(order.fee)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Kode unik</span>
          <span>{formatRupiah(order.uniqueCode)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
          <span>Total</span>
          <span>{formatRupiah(order.total)}</span>
        </div>
      </div>

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

      {order.status === "PENDING_PAYMENT" && (
        <>
          <PaymentInstructions payment={order.payment} qrDataUri={qrDataUri} snapConfig={snapConfig} />
          <CancelOrderButton token={token} />
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

      <button
        type="button"
        onClick={() => {
          const url = `${window.location.origin}/invoice/${token}`;
          const text = `Invoice pesanan ${order.orderNumber} - ${url}`;
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        }}
        className="flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        Kirim ke WhatsApp
      </button>
    </div>
  );
}
