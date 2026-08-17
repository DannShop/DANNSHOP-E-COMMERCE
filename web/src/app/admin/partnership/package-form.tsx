"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PARTNER_BENEFIT_CATALOG } from "@/lib/membership/benefits";
import type { PartnerPackage } from "@/lib/partner/package";
import type { ActionResult } from "@/app/actions/partners";

/**
 * Pengaturan paket mitra — SATU paket, bukan daftar bertingkat seperti reseller.
 *
 * Angka diskon dipakai APA ADANYA oleh jalur harga API mitra lewat
 * getMembershipContext(), jadi mengubahnya di sini langsung mengubah harga yang
 * dilihat semua mitra pada panggilan price-list berikutnya.
 */
export function PartnerPackageForm({
  initial,
  action,
}: {
  initial: PartnerPackage;
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Paket Mitra</h2>
        <p className="text-xs text-muted-foreground">
          Berlaku untuk semua mitra H2H. Terpisah dari paket reseller — mitra tidak perlu punya
          akun reseller untuk mendapat harga ini.
        </p>
      </div>

      <label className="flex items-start gap-2 rounded-md bg-muted/40 p-3">
        <input
          type="checkbox"
          name="isOpen"
          defaultChecked={initial.isOpen}
          className="mt-0.5 size-4"
        />
        <span className="text-xs">
          <span className="block font-medium">Buka pendaftaran mitra baru</span>
          <span className="block text-muted-foreground">
            Kalau dimatikan, tombol bayar di halaman pengajuan tidak muncul. Mitra yang sudah
            aktif tidak terpengaruh sama sekali.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium">Biaya join (Rp)</span>
          <input
            name="joinPrice"
            type="number"
            min={0}
            defaultValue={initial.joinPrice.toString()}
            className="block w-full rounded border bg-background px-2 py-1.5 text-sm"
          />
          <span className="block text-[11px] text-muted-foreground">
            Sekali bayar. Isi 0 kalau gratis — tetap lewat alur pembayaran.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium">Diskon harga produk (%)</span>
          <input
            name="discountPercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={(initial.discountPercent / 100).toString()}
            className="block w-full rounded border bg-background px-2 py-1.5 text-sm"
          />
          <span className="block text-[11px] text-muted-foreground">
            Dipotong dari harga jual, tapi tidak pernah menembus harga modal.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium">Potongan flat produk manual (Rp)</span>
          <input
            name="discountFlatManual"
            type="number"
            min={0}
            defaultValue={initial.discountFlatManual.toString()}
            className="block w-full rounded border bg-background px-2 py-1.5 text-sm"
          />
          <span className="block text-[11px] text-muted-foreground">
            Khusus produk yang kamu kirim manual. Angka ini MENGGANTIKAN diskon persen di produk
            itu, bukan ditambahkan. Isi 0 kalau tidak dipakai.
          </span>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium">Bonus tiap isi saldo (%)</span>
          <input
            name="depositBonusPercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={(initial.depositBonusPercent / 100).toString()}
            className="block w-full rounded border bg-background px-2 py-1.5 text-sm"
          />
          <span className="block text-[11px] text-muted-foreground">
            Hanya berlaku kalau benefit &quot;Bonus saldo&quot; di bawah dicentang.
          </span>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium">Benefit paket</legend>
        <p className="text-[11px] text-muted-foreground">
          Hanya benefit yang benar-benar bisa berlaku untuk mitra yang ditampilkan. Benefit
          checkout tidak ada di sini karena order H2H dipotong dari saldo, tidak lewat payment
          gateway.
        </p>
        {PARTNER_BENEFIT_CATALOG.map((b) => (
          <label key={b.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              name="benefits"
              value={b.key}
              defaultChecked={initial.benefits.includes(b.key as never)}
              className="mt-0.5 size-4"
            />
            <span className="text-xs">
              <span className="block font-medium">{b.label}</span>
              <span className="block text-muted-foreground">{b.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state?.ok && <p className="text-xs text-emerald-600 dark:text-emerald-400">{state.ok}</p>}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Menyimpan..." : "Simpan paket"}
      </Button>
    </form>
  );
}
