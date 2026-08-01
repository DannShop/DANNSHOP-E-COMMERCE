"use client";

import { useActionState, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QrCode, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TrustBadges } from "@/components/trust-badges";
import { createCheckoutOrder, type CheckoutResult } from "@/app/actions/checkout";
import { hasSufficientBalance } from "@/lib/wallet/decisions";
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

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <h2 className="font-heading text-base font-bold">{title}</h2>
    </div>
  );
}

export function ProductDetailClient({
  product,
  session,
}: {
  product: ProductForCheckout;
  session: { email: string; walletBalance: bigint } | null;
}) {
  const purchasableItems = product.items.filter((i) => i.purchasable);
  const [selectedItemId, setSelectedItemId] = useState(purchasableItems[0]?.id ?? "");
  const selectedItem = purchasableItems.find((i) => i.id === selectedItemId) ?? purchasableItems[0];

  const router = useRouter();
  const [state, formAction, pending] = useActionState(withPrevState(createCheckoutOrder), INITIAL_STATE);

  const goToInvoice = useCallback(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);

  useEffect(() => {
    // paymentMethod "balance" tidak pernah balikin snapToken (bayar langsung
    // di server, tidak lewat Midtrans) - order.publicToken saja cukup buat
    // langsung ke invoice, tidak perlu tunggu popup Snap.
    if (state.publicToken && !state.snapToken) {
      goToInvoice();
      return;
    }
    if (!state.snapToken) return;
    if (!window.snap) {
      console.error("Snap.js belum termuat, tidak bisa buka popup pembayaran");
      return;
    }
    window.snap.pay(state.snapToken, {
      onSuccess: goToInvoice,
      onPending: goToInvoice,
      onClose: () => {
        // customer tutup popup tanpa bayar - order tetap PENDING_PAYMENT,
        // form tetap tampil, bisa submit ulang (dapat snapToken baru).
      },
    });
  }, [state.snapToken, state.publicToken, goToInvoice]);

  if (purchasableItems.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-muted-foreground">
        {product.name} sedang tidak tersedia untuk dibeli saat ini.
      </div>
    );
  }

  const canPayWithBalance = session ? hasSufficientBalance(session.walletBalance, selectedItem?.sellingPrice ?? 0n) : false;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-balance">{product.name}</h1>
        {product.publisher && <p className="mt-1 text-sm text-muted-foreground">{product.publisher}</p>}
      </div>

      <TrustBadges />

      <form action={formAction} className="flex flex-col gap-6 rounded-[var(--radius)] border bg-card p-5">
        <input type="hidden" name="productItemId" value={selectedItemId} />

        <div className="flex flex-col gap-3">
          <StepHeader n={1} title="Masukkan Data Akun" />
          {product.inputFields.map((field) => (
            <div key={field.name} className="flex flex-col gap-2">
              <Label htmlFor={`target-${field.name}`}>{field.label}</Label>
              <Input id={`target-${field.name}`} name={`target.${field.name}`} required className="h-11 text-base" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t pt-6">
          <StepHeader n={2} title="Pilih Nominal" />
          <div className="grid gap-3 sm:grid-cols-2">
            {purchasableItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={`relative flex flex-col gap-1 overflow-hidden rounded-[var(--radius)] border-2 p-3 text-left transition-colors ${
                  item.id === selectedItemId ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  <Zap className="size-3" aria-hidden="true" />
                  Instan
                </span>
                <span className="text-sm font-medium">{item.name}</span>
                <span className="font-heading text-base font-bold">{formatRupiah(item.sellingPrice)}</span>
              </button>
            ))}
          </div>
          {selectedItem && (
            <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
              <span className="text-sm text-muted-foreground">Total Bayar</span>
              <span className="font-heading text-2xl font-bold text-primary">
                {formatRupiah(selectedItem.sellingPrice)}
              </span>
            </div>
          )}
        </div>

        {session && (
          <div className="flex flex-col gap-3 border-t pt-6">
            <StepHeader n={3} title="Pilih Pembayaran" />
            <RadioGroup name="paymentMethod" defaultValue="qris">
              <RadioGroupItem value="qris">
                <QrCode className="size-4" aria-hidden="true" />
                QRIS, VA, & Lainnya
              </RadioGroupItem>
              <RadioGroupItem value="balance" disabled={!canPayWithBalance}>
                <Wallet className="size-4" aria-hidden="true" />
                Saldo ({formatRupiah(session.walletBalance)})
              </RadioGroupItem>
            </RadioGroup>
            {!canPayWithBalance && (
              <p className="text-xs text-muted-foreground">
                Saldo tidak cukup.{" "}
                <Link href="/account/deposit" className="text-primary underline">
                  Isi saldo dulu
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-6">
          <StepHeader n={session ? 4 : 3} title="Detail Kontak" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="buyerEmail">Email (untuk akses invoice)</Label>
            <Input
              id="buyerEmail"
              name="buyerEmail"
              type="email"
              required
              defaultValue={session?.email ?? undefined}
              className="h-11 text-base"
            />
          </div>
        </div>

        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button type="submit" disabled={pending} className="h-11 w-full text-base font-heading">
          {pending ? "Memproses..." : "Beli Sekarang"}
        </Button>
      </form>
    </div>
  );
}
