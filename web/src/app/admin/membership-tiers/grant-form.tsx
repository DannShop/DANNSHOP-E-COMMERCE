"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

// Grant manual - alat CS untuk memberi tier tanpa memotong saldo user
// (kompensasi, hadiah promo, dsb). Terpisah dari alur beli
// (actions/membership.ts purchaseTier) supaya audit trail-nya jelas: baris
// UserMembership hasil ini punya source="manual_grant" & pricePaid=0,
// tercatat di AdminActionLog siapa admin yang melakukannya.
export function GrantMembershipForm({
  tiers,
  action,
}: {
  tiers: { id: string; name: string }[];
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="grant-email" className="text-xs">Email user</Label>
        <Input id="grant-email" name="email" type="email" placeholder="user@email.com" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="grant-tier" className="text-xs">Tier</Label>
        <Select name="tierId" items={tiers.map((t) => ({ value: t.id, label: t.name }))} required>
          <SelectTrigger id="grant-tier" className="w-40">
            <SelectValue placeholder="Pilih tier" />
          </SelectTrigger>
          <SelectContent>
            {tiers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-28 space-y-1.5">
        <Label htmlFor="grant-days" className="text-xs">Durasi (hari)</Label>
        <Input id="grant-days" name="days" type="number" min={1} max={3650} placeholder="default tier" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Memberikan..." : "Beri Tier"}
      </Button>
      {(state.ok || state.error) && (
        <p className={`w-full text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
