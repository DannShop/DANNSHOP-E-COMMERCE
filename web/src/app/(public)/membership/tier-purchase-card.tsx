"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import { BENEFIT_CATALOG } from "@/lib/membership/benefits";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export interface TierCardData {
  id: string;
  name: string;
  price: string;
  durationDays: number;
  discountPercent: number;
  badgeColor: string;
  benefits: string[];
}

export function TierPurchaseCard({
  tier,
  isLoggedIn,
  currentTierId,
  currentTierExpiresAt,
  action,
}: {
  tier: TierCardData;
  isLoggedIn: boolean;
  currentTierId: string | null;
  currentTierExpiresAt: string | null; // ISO string, sudah diformat lokal id-ID di server
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const isCurrent = currentTierId === tier.id;
  const isSwitchingFromOtherTier = isLoggedIn && currentTierId !== null && !isCurrent;
  const enabledBenefits = BENEFIT_CATALOG.filter((b) => tier.benefits.includes(b.key));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (isSwitchingFromOtherTier) {
      const ok = window.confirm(
        `Kamu masih punya tier aktif (berlaku sampai ${currentTierExpiresAt}). Membeli tier "${tier.name}" akan LANGSUNG MENGGANTI tier aktifmu sekarang - sisa waktu tier lama tidak dikembalikan/dikonversi. Lanjutkan?`,
      );
      if (!ok) e.preventDefault();
    }
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border-2 bg-card p-6"
      style={{ borderColor: isCurrent ? tier.badgeColor : "var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold text-white"
          style={{ backgroundColor: tier.badgeColor }}
        >
          <Crown className="size-3.5" aria-hidden="true" />
          {tier.name}
        </span>
        {isCurrent && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Tier Aktifmu
          </span>
        )}
      </div>

      <div>
        <p className="font-heading text-2xl font-bold">{formatRupiah(BigInt(tier.price))}</p>
        <p className="text-xs text-muted-foreground">setiap {tier.durationDays} hari</p>
      </div>

      {tier.discountPercent > 0 && (
        <p className="text-sm font-medium text-primary">
          Diskon {(tier.discountPercent / 100).toLocaleString("id-ID")}% harga produk
        </p>
      )}

      <ul className="flex flex-col gap-2 text-sm">
        {enabledBenefits.length === 0 && tier.discountPercent === 0 ? (
          <li className="text-muted-foreground">Tidak ada benefit tambahan.</li>
        ) : (
          enabledBenefits.map((b) => (
            <li key={b.key} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{b.label}</span>
            </li>
          ))
        )}
      </ul>

      {isLoggedIn ? (
        <form action={formAction} onSubmit={handleSubmit}>
          <input type="hidden" name="tierId" value={tier.id} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Memproses..." : isCurrent ? "Perpanjang Tier Ini" : "Beli Tier Ini"}
          </Button>
        </form>
      ) : (
        <Link href="/login" className={cn(buttonVariants(), "w-full")}>
          Login untuk beli
        </Link>
      )}
      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
          {state.error?.includes("Saldo tidak cukup") && (
            <>
              {" "}
              <Link href="/account/deposit" className="font-medium underline">
                Isi saldo
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
