"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createDeposit, type DepositResult } from "@/app/actions/deposit";
import { MIN_DEPOSIT, MAX_DEPOSIT } from "@/lib/validation/deposit";

const PRESETS = [25_000n, 50_000n, 100_000n, 250_000n, 500_000n];

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

// Nominal custom cuma dipakai untuk preview fee di client - kalau bukan
// digit murni (kosong, minus, koma, dst), preview jatuh ke 0 dan menunggu
// input valid. Validasi otoritatif tetap di server lewat depositSchema.
function parseAmountForPreview(raw: string): bigint {
  if (!/^\d+$/.test(raw)) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

const INITIAL_STATE: DepositResult = {};

export function DepositForm({
  paymentMethods,
}: {
  paymentMethods: { code: string; label: string; feeFlat: string; feePercent: number }[];
}) {
  const [selected, setSelected] = useState<bigint | "custom">(PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [selectedMethod, setSelectedMethod] = useState(paymentMethods[0]?.code ?? "");
  const [state, formAction, pending] = useActionState(createDeposit, INITIAL_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.depositId) router.push(`/account/deposit/${state.depositId}`);
  }, [state.depositId, router]);

  const amount = selected === "custom" ? custom : selected.toString();
  const amountForPreview = selected === "custom" ? parseAmountForPreview(custom) : selected;

  // Preview "Total Bayar" harus ikut fee metode pembayaran yang lagi dipilih
  // (bukan cuma nominal isi saldo) - fee final tetap dihitung ulang otoritatif
  // di server (createDeposit), ini murni tampilan supaya tidak menyesatkan
  // dibanding breakdown fee yang sudah ada di tiap baris metode. Kode unik
  // (Rp1-999) sengaja tidak diikutkan ke angka karena di-generate acak di
  // server, bukan bisa diprediksi di client.
  const selectedMethodConfig = paymentMethods.find((m) => m.code === selectedMethod);
  const previewFee = selectedMethodConfig
    ? (amountForPreview * BigInt(selectedMethodConfig.feePercent)) / 10_000n + BigInt(selectedMethodConfig.feeFlat)
    : 0n;
  const previewTotal = amountForPreview + previewFee;

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="paymentMethod" value={selectedMethod} />

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.toString()}
            type="button"
            aria-pressed={selected === preset}
            onClick={() => setSelected(preset)}
            className={`min-h-11 rounded-[var(--radius)] border-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
              selected === preset ? "border-primary bg-primary/10 text-primary" : "border-border"
            }`}
          >
            {formatRupiah(preset)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={selected === "custom"}
          onClick={() => setSelected("custom")}
          className={`min-h-11 rounded-[var(--radius)] border-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
            selected === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border"
          }`}
        >
          Nominal Lain
        </button>
      </div>

      {selected === "custom" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-amount">
            Nominal ({formatRupiah(MIN_DEPOSIT)} - {formatRupiah(MAX_DEPOSIT)})
          </Label>
          <Input
            id="custom-amount"
            type="number"
            min={Number(MIN_DEPOSIT)}
            max={Number(MAX_DEPOSIT)}
            step={1000}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            required
            className="h-11 text-base"
          />
        </div>
      )}

      {paymentMethods.length > 0 && (
        <div className="flex flex-col gap-3 border-t pt-4">
          <Label>Metode Pembayaran</Label>
          <RadioGroup value={selectedMethod} onValueChange={setSelectedMethod}>
            {paymentMethods.map((m) => {
              const fee = (amountForPreview * BigInt(m.feePercent)) / 10_000n + BigInt(m.feeFlat);
              return (
                <RadioGroupItem key={m.code} value={m.code}>
                  <QrCode className="size-4" aria-hidden="true" />
                  {m.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fee > 0n ? `+ ${formatRupiah(fee)}` : "Gratis"}
                  </span>
                </RadioGroupItem>
              );
            })}
          </RadioGroup>
        </div>
      )}

      {amountForPreview > 0n && selectedMethodConfig && (
        <div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Bayar</span>
            <span className="font-heading text-2xl font-bold text-primary">{formatRupiah(previewTotal)}</span>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Sudah termasuk fee metode pembayaran. Belum termasuk kode unik (+ Rp1-999, muncul di halaman status).
          </p>
        </div>
      )}

      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
      <Button
        type="submit"
        disabled={pending || Boolean(state.depositId) || !amount || !selectedMethod}
        className="h-11 w-full text-base font-heading"
      >
        {pending ? "Memproses..." : "Isi Saldo"}
      </Button>
    </form>
  );
}
