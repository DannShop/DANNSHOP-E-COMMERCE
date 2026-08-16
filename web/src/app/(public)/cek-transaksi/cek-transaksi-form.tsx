"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { lookupOrder, type OrderLookupResult } from "@/app/actions/order-lookup";

const INITIAL_STATE: OrderLookupResult = {};

// Status yang tampil hijau/merah/abu di daftar. Dipetakan di sini, bukan di
// server, supaya server action tetap mengembalikan status mentah - satu-satunya
// bentuk yang tidak perlu ikut diubah kalau nanti labelnya berubah.
function statusVariant(status: string): "success" | "warning" | "destructive" | "muted" {
  if (status === "COMPLETED") return "success";
  if (status === "PENDING_PAYMENT" || status === "PAID" || status === "PROCESSING") return "warning";
  if (status === "FAILED" || status === "EXPIRED") return "destructive";
  return "muted";
}

export function CekTransaksiForm() {
  const [state, formAction, pending] = useActionState(lookupOrder, INITIAL_STATE);
  const router = useRouter();

  // Cuma jalan kalau pencarian memakai nomor pesanan - hasilnya satu invoice,
  // jadi tidak ada gunanya menampilkan daftar berisi satu baris.
  useEffect(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            className="h-11 text-base"
            placeholder="email@contoh.com"
          />
          <p className="text-xs text-muted-foreground">Email yang kamu isi waktu memesan.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="orderNumber">Nomor Pesanan (opsional)</Label>
          <Input id="orderNumber" name="orderNumber" className="h-11 text-base" placeholder="INV-20260805-0001" />
          <p className="text-xs text-muted-foreground">
            Kosongkan saja kalau tidak ingat — kami tampilkan seluruh pesanan dari email itu.
          </p>
        </div>
        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button type="submit" disabled={pending} className="h-11 w-full font-heading text-base">
          {pending ? "Mencari..." : "Cek Transaksi"}
        </Button>
      </form>

      {state.orders && state.orders.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {state.orders.length} pesanan terakhir. Klik salah satu untuk melihat invoice lengkapnya.
          </p>
          {state.orders.map((order) => (
            <Link
              key={order.publicToken}
              href={`/invoice/${order.publicToken}`}
              className="flex flex-col gap-1 rounded-[var(--radius)] border bg-card p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                <Badge variant={statusVariant(order.status)}>
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              </div>
              <span className="text-sm font-medium">
                {order.productName} · {order.itemName}
              </span>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{order.maskedTarget}</span>
                <span className="tabular-nums">{order.createdAtDisplay}</span>
              </div>
              <span className="font-heading text-sm font-bold tabular-nums">
                {formatRupiah(BigInt(order.total))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
