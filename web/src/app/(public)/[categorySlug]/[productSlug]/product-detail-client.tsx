"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import type { ProductForCheckout } from "@/lib/catalog/public";

const INITIAL_STATE: CheckoutResult = {};

function withPrevState(action: typeof createCheckoutOrder) {
  return (_prev: CheckoutResult, formData: FormData) => action(formData);
}

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export function ProductDetailClient({ product }: { product: ProductForCheckout }) {
  const purchasableItems = product.items.filter((i) => i.purchasable);
  const [selectedItemId, setSelectedItemId] = useState(purchasableItems[0]?.id ?? "");
  const selectedItem = purchasableItems.find((i) => i.id === selectedItemId) ?? purchasableItems[0];

  const router = useRouter();
  const [state, formAction, pending] = useActionState(withPrevState(createCheckoutOrder), INITIAL_STATE);

  useEffect(() => {
    if (state.orderNumber) router.push(`/invoice/${state.orderNumber}`);
  }, [state.orderNumber, router]);

  if (purchasableItems.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-muted-foreground">
        {product.name} sedang tidak tersedia untuk dibeli saat ini.
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div>
        <h1 className="font-heading text-2xl font-bold text-balance">{product.name}</h1>
        {product.publisher && <p className="mt-1 text-sm text-muted-foreground">{product.publisher}</p>}
      </div>

      <form action={formAction} className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card p-5">
        <input type="hidden" name="productItemId" value={selectedItemId} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="item-select">Pilih Nominal</Label>
          <select
            id="item-select"
            className="h-11 rounded-md border bg-background px-3 text-base"
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
          >
            {purchasableItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {formatRupiah(item.sellingPrice)}
              </option>
            ))}
          </select>
        </div>

        {selectedItem && (
          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
            <span className="text-sm text-muted-foreground">Total Bayar</span>
            <span className="font-heading text-2xl font-bold text-primary">
              {formatRupiah(selectedItem.sellingPrice)}
            </span>
          </div>
        )}

        {product.inputFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-2">
            <Label htmlFor={`target-${field.name}`}>{field.label}</Label>
            <Input id={`target-${field.name}`} name={`target.${field.name}`} required className="h-11 text-base" />
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <Label htmlFor="buyerEmail">Email (untuk invoice)</Label>
          <Input id="buyerEmail" name="buyerEmail" type="email" required className="h-11 text-base" />
        </div>

        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button type="submit" disabled={pending} className="h-11 w-full text-base font-heading">
          {pending ? "Memproses..." : "Beli Sekarang"}
        </Button>
      </form>
    </div>
  );
}
