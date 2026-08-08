"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BenefitChecklist } from "./benefit-checklist";
import { formatRupiah } from "@/lib/format";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

// Harga contoh dipakai kalkulator diskon live - angka bulat yang gampang
// dibayangkan admin ("kalau item Rp100.000, member tier ini bayar berapa").
const PREVIEW_PRICE = 100_000n;

export function TierForm({
  tier,
  updateAction,
  deleteAction,
}: {
  tier: {
    id: string;
    slug: string;
    name: string;
    price: string;
    durationDays: number;
    discountPercent: number;
    depositBonusPercent: number;
    badgeColor: string;
    benefits: string[];
    sortOrder: number;
    isActive: boolean;
    membershipCount: number;
  };
  updateAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState(
    (_prev: ActionResult, formData: FormData) => updateAction(formData),
    INITIAL_STATE,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    (_prev: ActionResult, formData: FormData) => deleteAction(formData),
    INITIAL_STATE,
  );
  const [discountPercent, setDiscountPercent] = useState(tier.discountPercent);
  const discountedPreview = PREVIEW_PRICE - (PREVIEW_PRICE * BigInt(Math.max(0, discountPercent))) / 10_000n;

  return (
    <div className="rounded-lg border p-4" style={{ borderLeftWidth: 4, borderLeftColor: tier.badgeColor }}>
      <form action={updateFormAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={tier.id} />
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: tier.badgeColor }}
          >
            {tier.name}
          </span>
          <span className="text-xs text-muted-foreground">/{tier.slug}</span>
          <span className="text-xs text-muted-foreground">
            · {tier.membershipCount} kepemilikan (aktif + riwayat)
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`name-${tier.id}`} className="text-xs">Nama tier</Label>
            <Input id={`name-${tier.id}`} name="name" defaultValue={tier.name} required maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`price-${tier.id}`} className="text-xs">Harga (Rp)</Label>
            <Input id={`price-${tier.id}`} name="price" type="number" min={0} defaultValue={tier.price} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`durationDays-${tier.id}`} className="text-xs">Masa berlaku (hari)</Label>
            <Input
              id={`durationDays-${tier.id}`}
              name="durationDays"
              type="number"
              min={1}
              max={3650}
              defaultValue={tier.durationDays}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`badgeColor-${tier.id}`} className="text-xs">Warna lencana</Label>
            <div className="flex items-center gap-2">
              <input
                id={`badgeColor-${tier.id}`}
                name="badgeColor"
                type="color"
                defaultValue={tier.badgeColor}
                className="h-9 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-1"
              />
              <span className="text-xs text-muted-foreground">{tier.badgeColor}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`discountPercent-${tier.id}`} className="text-xs">Diskon produk (basis point)</Label>
            <Input
              id={`discountPercent-${tier.id}`}
              name="discountPercent"
              type="number"
              min={0}
              max={10_000}
              defaultValue={tier.discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
              required
            />
            <p className="text-xs text-muted-foreground">
              100 = 1%. Preview: item {formatRupiah(PREVIEW_PRICE)} → {formatRupiah(discountedPreview < 0n ? 0n : discountedPreview)}
              {" "}(dibatasi harga modal per item, tidak akan lebih murah dari itu).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`depositBonusPercent-${tier.id}`} className="text-xs">Bonus deposit (basis point)</Label>
            <Input
              id={`depositBonusPercent-${tier.id}`}
              name="depositBonusPercent"
              type="number"
              min={0}
              max={10_000}
              defaultValue={tier.depositBonusPercent}
              required
            />
            <p className="text-xs text-muted-foreground">
              Hanya aktif kalau benefit &quot;Bonus saldo tiap isi saldo&quot; dicentang di bawah.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`sortOrder-${tier.id}`} className="text-xs">Urutan tampil</Label>
            <Input id={`sortOrder-${tier.id}`} name="sortOrder" type="number" defaultValue={tier.sortOrder} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox name="isActive" defaultChecked={tier.isActive} />
            Bisa dibeli baru
          </label>
        </div>

        <BenefitChecklist enabled={tier.benefits} idPrefix={`tier-${tier.id}`} />

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={updatePending}>
            {updatePending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
        {(updateState.ok || updateState.error) && (
          <p className={`text-xs ${updateState.error ? "text-destructive" : "text-emerald-700"}`}>
            {updateState.error ?? updateState.ok}
          </p>
        )}
      </form>

      <form
        action={deleteFormAction}
        onSubmit={(e) => {
          if (!window.confirm(`Hapus tier "${tier.name}"? Aksi ini tidak bisa dibatalkan.`)) {
            e.preventDefault();
          }
        }}
        className="mt-2 border-t pt-2"
      >
        <input type="hidden" name="id" value={tier.id} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={deletePending || tier.membershipCount > 0}
          title={tier.membershipCount > 0 ? "Sudah pernah dibeli/diberikan, nonaktifkan saja lewat toggle" : undefined}
        >
          {deletePending ? "..." : "Hapus Tier"}
        </Button>
        {(deleteState.ok || deleteState.error) && (
          <p className={`mt-1 text-xs ${deleteState.error ? "text-destructive" : "text-emerald-700"}`}>
            {deleteState.error ?? deleteState.ok}
          </p>
        )}
      </form>
    </div>
  );
}
