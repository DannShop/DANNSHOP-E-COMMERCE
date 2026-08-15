"use client";

import { useState, useTransition } from "react";
import { Check, TicketPercent, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewVoucher } from "@/app/actions/voucher";
import { formatRupiah } from "@/lib/format";

export interface AppliedVoucherState {
  code: string;
  discount: bigint;
}

/**
 * Kolom kode promo di halaman checkout.
 *
 * Potongannya DIHITUNG DI SERVER, tidak pernah di sini. Komponen ini hanya
 * menampilkan hasilnya dan menitipkan kodenya lewat hidden input supaya ikut
 * terkirim saat form checkout dikirim - server menilai ulang kodenya dari nol
 * pada saat itu. Jadi mengutak-atik state di browser tidak menghasilkan
 * potongan apa pun; yang berubah cuma angka di layar sendiri.
 */
export function VoucherField({
  productItemId,
  targetValues,
  applied,
  onApplied,
}: {
  productItemId: string;
  targetValues: Record<string, string>;
  applied: AppliedVoucherState | null;
  onApplied: (v: AppliedVoucherState | null) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function terapkan() {
    if (!code.trim()) {
      setError("Masukkan kode promo dulu.");
      return;
    }
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("productItemId", productItemId);
      fd.set("voucherCode", code);
      // Nomor tujuan ikut dikirim: batas pemakaian voucher dihitung per tujuan,
      // jadi tanpa ini pratinjau bisa mengatakan "berhasil" untuk kode yang
      // nanti ditolak saat checkout.
      for (const [name, value] of Object.entries(targetValues)) {
        fd.set(`target.${name}`, value);
      }

      const hasil = await previewVoucher(fd);
      if (!hasil.ok) {
        setError(hasil.message);
        onApplied(null);
        return;
      }
      onApplied({ code: hasil.code, discount: BigInt(hasil.discount) });
      setCode("");
    });
  }

  if (applied) {
    return (
      <div className="flex flex-col gap-2">
        {/* Hidden input inilah yang benar-benar dibaca server saat checkout. */}
        <input type="hidden" name="voucherCode" value={applied.code} />
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-primary/40 bg-primary/5 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{applied.code}</span>
              <span className="block text-xs text-muted-foreground">
                Potongan {formatRupiah(applied.discount)}
              </span>
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onApplied(null);
              setError(null);
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Lepas
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="voucher-code">Kode promo (opsional)</Label>
      <div className="flex items-stretch gap-2">
        <Input
          id="voucher-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="HEMAT10"
          autoComplete="off"
          // BUKAN name="voucherCode": selama belum diterapkan, kodenya tidak
          // boleh ikut terkirim saat form checkout dikirim. Kalau ikut, kode
          // setengah diketik akan menggagalkan checkout dengan pesan "kode
          // promo tidak ditemukan" - padahal orangnya cuma belum selesai.
          className="h-11 flex-1 text-base uppercase"
          // Enter di kolom ini menerapkan promo, BUKAN mengirim form checkout.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              terapkan();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={terapkan} disabled={pending} className="h-11 px-4">
          <TicketPercent className="size-4" aria-hidden="true" />
          {pending ? "Cek..." : "Pakai"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
