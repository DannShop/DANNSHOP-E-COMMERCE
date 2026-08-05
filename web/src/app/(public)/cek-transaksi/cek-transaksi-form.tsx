"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupOrder, type OrderLookupResult } from "@/app/actions/order-lookup";

const INITIAL_STATE: OrderLookupResult = {};

export function CekTransaksiForm() {
  const [state, formAction, pending] = useActionState(lookupOrder, INITIAL_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required className="h-11 text-base" placeholder="email@contoh.com" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="orderNumber">Nomor Pesanan</Label>
        <Input id="orderNumber" name="orderNumber" required className="h-11 text-base" placeholder="INV-20260805-0001" />
      </div>
      {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
      <Button type="submit" disabled={pending} className="h-11 w-full text-base font-heading">
        {pending ? "Mencari..." : "Cek Transaksi"}
      </Button>
    </form>
  );
}
