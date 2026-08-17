"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BenefitChecklist } from "./benefit-checklist";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function NewTierForm({ action }: { action: (formData: FormData) => Promise<ActionResult> }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-name" className="text-xs">Nama tier</Label>
          <Input id="new-tier-name" name="name" placeholder="Diamond" required maxLength={50} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-slug" className="text-xs">Slug</Label>
          <Input id="new-tier-slug" name="slug" placeholder="diamond" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-price" className="text-xs">Harga (Rp)</Label>
          <Input id="new-tier-price" name="price" type="number" min={0} placeholder="150000" required />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-discount" className="text-xs">Diskon produk (basis point)</Label>
          <Input id="new-tier-discount" name="discountPercent" type="number" min={0} max={10_000} defaultValue={0} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-flat" className="text-xs">Potongan flat produk manual</Label>
          <Input id="new-tier-flat" name="discountFlatManual" type="number" min={0} defaultValue={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-bonus" className="text-xs">Bonus deposit (basis point)</Label>
          <Input id="new-tier-bonus" name="depositBonusPercent" type="number" min={0} max={10_000} defaultValue={0} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-tier-color" className="text-xs">Warna lencana</Label>
          <input
            id="new-tier-color"
            name="badgeColor"
            type="color"
            defaultValue="#a3a3a3"
            className="h-9 w-full cursor-pointer rounded border bg-transparent p-1"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox name="isActive" defaultChecked />
          Bisa dibeli baru
        </label>
      </div>

      <BenefitChecklist enabled={[]} idPrefix="new-tier" />

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Membuat..." : "Buat Tier"}
      </Button>
      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>{state.error ?? state.ok}</p>
      )}
    </form>
  );
}
