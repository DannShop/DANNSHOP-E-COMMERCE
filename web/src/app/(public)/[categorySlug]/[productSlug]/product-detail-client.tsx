"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
  paymentMethods,
}: {
  product: ProductForCheckout;
  session: { email: string; walletBalance: bigint } | null;
  paymentMethods: { code: string; label: string; logoUrl: string | null; feeFlat: string; feePercent: number }[];
}) {
  const purchasableItems = product.items.filter((i) => i.purchasable);
  const [selectedItemId, setSelectedItemId] = useState(purchasableItems[0]?.id ?? "");
  const [selectedMethod, setSelectedMethod] = useState(paymentMethods[0]?.code ?? "");
  const selectedItem = purchasableItems.find((i) => i.id === selectedItemId) ?? purchasableItems[0];

  const router = useRouter();
  const [state, formAction, pending] = useActionState(withPrevState(createCheckoutOrder), INITIAL_STATE);

  useEffect(() => {
    if (state.publicToken) router.push(`/invoice/${state.publicToken}`);
  }, [state.publicToken, router]);

  if (purchasableItems.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border bg-card p-6 text-center text-muted-foreground">
        {product.name} sedang tidak tersedia untuk dibeli saat ini.
      </div>
    );
  }

  const canPayWithBalance = session ? hasSufficientBalance(session.walletBalance, selectedItem?.sellingPrice ?? 0n) : false;

  // Preview "Total Bayar" harus ikut fee metode pembayaran yang lagi
  // dipilih (bukan cuma sellingPrice) - fee final tetap dihitung ulang
  // otoritatif di server (createCheckoutOrder), ini murni tampilan supaya
  // tidak menyesatkan dibanding breakdown fee yang sudah ada di tiap baris
  // metode. Kode unik (Rp1-999) sengaja tidak diikutkan ke angka karena
  // di-generate acak di server, bukan bisa diprediksi di client.
  const isBalanceSelected = Boolean(session) && selectedMethod === "balance";
  const selectedMethodConfig = paymentMethods.find((m) => m.code === selectedMethod);
  const previewFee =
    selectedItem && selectedMethodConfig && !isBalanceSelected
      ? (selectedItem.sellingPrice * BigInt(selectedMethodConfig.feePercent)) / 10_000n + BigInt(selectedMethodConfig.feeFlat)
      : 0n;
  const previewTotal = selectedItem ? selectedItem.sellingPrice + previewFee : 0n;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        {product.banner && (
          <div className="relative aspect-21/9 w-full overflow-hidden rounded-[var(--radius)] bg-gradient-to-br from-primary to-accent">
            <Image
              src={product.banner}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 672px, 100vw"
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
          </div>
        )}

        <div className="relative flex items-end gap-3 px-1">
          <div
            className={`relative z-10 size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary to-accent ring-4 ring-background ${product.banner ? "-mt-8" : ""}`}
          >
            {product.banner && (
              <Image src={product.banner} alt="" fill sizes="64px" className="object-cover" unoptimized />
            )}
          </div>
          <div className="pb-1">
            <h1 className="font-heading text-2xl font-bold text-balance">{product.name}</h1>
            {product.publisher && <p className="text-sm text-muted-foreground">{product.publisher}</p>}
          </div>
        </div>
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
            <div className="flex flex-col gap-1 rounded-md bg-muted px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Bayar</span>
                <span className="font-heading text-2xl font-bold text-primary">
                  {formatRupiah(previewTotal)}
                </span>
              </div>
              {!isBalanceSelected && (
                <p className="text-right text-xs text-muted-foreground">
                  Sudah termasuk fee metode pembayaran. Belum termasuk kode unik (+ Rp1-999, muncul di halaman invoice).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t pt-6">
          <StepHeader n={3} title="Pilih Pembayaran" />
          <input
            type="hidden"
            name="paymentMethod"
            value={session && selectedMethod === "balance" ? "balance" : selectedMethod}
          />
          <RadioGroup value={selectedMethod} onValueChange={setSelectedMethod}>
            {paymentMethods.map((m) => {
              const feeBp = m.feePercent;
              const fee = selectedItem
                ? (selectedItem.sellingPrice * BigInt(feeBp)) / 10_000n + BigInt(m.feeFlat)
                : 0n;
              return (
                <RadioGroupItem key={m.code} value={m.code}>
                  {m.logoUrl ? (
                    <span className="relative size-5 shrink-0 overflow-hidden rounded-full bg-white p-0.5">
                      <Image src={m.logoUrl} alt="" fill sizes="20px" className="object-contain" unoptimized />
                    </span>
                  ) : (
                    <QrCode className="size-4" aria-hidden="true" />
                  )}
                  {m.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {fee > 0n ? `+ ${formatRupiah(fee)}` : "Gratis"}
                  </span>
                </RadioGroupItem>
              );
            })}
            {session && (
              <RadioGroupItem value="balance" disabled={!canPayWithBalance}>
                <Wallet className="size-4" aria-hidden="true" />
                Saldo ({formatRupiah(session.walletBalance)})
              </RadioGroupItem>
            )}
          </RadioGroup>
          {session && !canPayWithBalance && (
            <p className="text-xs text-muted-foreground">
              Saldo tidak cukup.{" "}
              <Link href="/account/deposit" className="text-primary underline">
                Isi saldo dulu
              </Link>
              .
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t pt-6">
          <StepHeader n={4} title="Detail Kontak" />
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="buyerPhone">Nomor WhatsApp (opsional)</Label>
            <Input
              id="buyerPhone"
              name="buyerPhone"
              type="tel"
              placeholder="08xxxxxxxxxx"
              className="h-11 text-base"
            />
            <p className="text-xs text-muted-foreground">Dipakai CS untuk menghubungi Anda kalau ada kendala pesanan.</p>
          </div>
        </div>

        {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
        <Button
          type="submit"
          disabled={pending || Boolean(state.publicToken)}
          className="h-11 w-full text-base font-heading"
        >
          {pending ? "Memproses..." : "Beli Sekarang"}
        </Button>
      </form>
    </div>
  );
}
