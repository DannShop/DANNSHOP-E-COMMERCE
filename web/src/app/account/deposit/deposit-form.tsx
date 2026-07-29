"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDeposit, type DepositResult } from "@/app/actions/deposit";
import { MIN_DEPOSIT, MAX_DEPOSIT } from "@/lib/validation/deposit";

const PRESETS = [25_000n, 50_000n, 100_000n, 250_000n, 500_000n];

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

const INITIAL_STATE: DepositResult = {};

export function DepositForm() {
  const [selected, setSelected] = useState<bigint | "custom">(PRESETS[1]);
  const [custom, setCustom] = useState("");
  const [state, formAction, pending] = useActionState(createDeposit, INITIAL_STATE);

  const amount = selected === "custom" ? custom : selected.toString();

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
      <input type="hidden" name="amount" value={amount} />

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

      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
      <Button type="submit" disabled={pending || !amount} className="h-11 w-full text-base font-heading">
        {pending ? "Memproses..." : "Isi Saldo"}
      </Button>
    </form>
  );
}
