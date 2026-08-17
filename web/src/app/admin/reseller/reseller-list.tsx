"use client";

import { useActionState, useState } from "react";
import { ActionMessage } from "@/components/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/format";

type ActionResult = { ok?: string; error?: string };

export interface ResellerRow {
  id: string;
  name: string;
  email: string;
  businessName: string;
  phone: string;
  referralCode: string | null;
  isActive: boolean;
  isActivated: boolean;
  tierName: string | null;
  tierColor: string | null;
  /** BigInt diserialkan sebagai string — Server Component tidak bisa mengirim BigInt. */
  tierPricePaid: string;
  joinedAt: string;
}

export function ResellerList({
  resellers,
  setActiveAction,
}: {
  resellers: ResellerRow[];
  setActiveAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, setActive, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => setActiveAction(formData),
    {} as ActionResult,
  );
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = q
    ? resellers.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.businessName.toLowerCase().includes(q) ||
          r.phone.includes(q),
      )
    : resellers;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Daftar reseller</h2>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama, email, usaha, HP..."
          className="w-full sm:w-64"
          aria-label="Cari reseller"
        />
      </div>

      <ActionMessage state={state} />

      <ul className="mt-4 divide-y">
        {shown.length === 0 && (
          <li className="py-4 text-xs text-muted-foreground">
            {resellers.length === 0 ? "Belum ada reseller." : "Tidak ada yang cocok dengan pencarian."}
          </li>
        )}

        {shown.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.businessName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.name} · {r.email} · {r.phone}
              </p>
              {r.referralCode && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Referral: <span className="font-mono">{r.referralCode}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {r.tierName ? (
                <Badge variant="default">
                  <span style={{ color: r.tierColor ?? undefined }}>{r.tierName}</span>
                </Badge>
              ) : (
                <Badge variant="warning">Gratis</Badge>
              )}

              {BigInt(r.tierPricePaid) > 0n && (
                <span className="text-xs text-muted-foreground">
                  dibayar {formatRupiah(BigInt(r.tierPricePaid))}
                </span>
              )}

              {/* Belum aktivasi ditampilkan terpisah dari nonaktif: keduanya
                  sama-sama "tidak dapat potongan", tapi sebabnya berbeda dan
                  tindakan yang benar juga berbeda - yang satu menunggu orangnya
                  mengklik email, yang satu keputusan admin. */}
              {!r.isActivated ? (
                <Badge variant="warning">Belum aktivasi</Badge>
              ) : r.isActive ? (
                <Badge variant="default">Aktif</Badge>
              ) : (
                <Badge variant="destructive">Nonaktif</Badge>
              )}

              <form action={setActive}>
                <input type="hidden" name="resellerId" value={r.id} />
                <input type="hidden" name="active" value={r.isActive ? "0" : "1"} />
                <Button type="submit" variant="outline" size="xs" disabled={pending}>
                  {r.isActive ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
