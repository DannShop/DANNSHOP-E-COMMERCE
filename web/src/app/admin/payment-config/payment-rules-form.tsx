"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { PaymentRules } from "@/lib/payment/rules";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function PaymentRulesForm({
  rules,
  action,
}: {
  rules: PaymentRules;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Order (checkout)</legend>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="uniqueCodeOrder" defaultChecked={rules.uniqueCodeOrder} />
            Pakai kode unik
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="feeOrder" defaultChecked={rules.feeOrder} />
            Pakai biaya admin
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Deposit (isi saldo member)</legend>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="uniqueCodeDeposit" defaultChecked={rules.uniqueCodeDeposit} />
            Pakai kode unik
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="feeDeposit" defaultChecked={rules.feeDeposit} />
            Pakai biaya admin
          </label>
        </fieldset>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="uniqueCodeMin">Kode unik minimum (Rp)</Label>
          <Input id="uniqueCodeMin" name="uniqueCodeMin" type="number" min={1} defaultValue={rules.uniqueCodeMin} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uniqueCodeMax">Kode unik maksimum (Rp)</Label>
          <Input id="uniqueCodeMax" name="uniqueCodeMax" type="number" min={1} defaultValue={rules.uniqueCodeMax} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Kode unik adalah selisih kecil yang ditambahkan ke nominal tagihan supaya tiap transaksi punya angka berbeda —
        memudahkan pencocokan manual. Besarnya diacak dalam rentang di atas. Nilai biaya admin sendiri diatur per
        metode di halaman Metode Pembayaran; saklar di sini hanya menentukan dipakai atau tidak.
      </p>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Menyimpan..." : "Simpan Aturan"}
      </Button>
      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
      )}
    </form>
  );
}
