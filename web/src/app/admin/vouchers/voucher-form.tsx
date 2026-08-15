"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/lib/format";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export interface VoucherFormValue {
  id: string;
  code: string;
  description: string;
  discountType: "PERCENT" | "FIXED";
  percentBp: number;
  amount: string;
  minSpend: string;
  quota: number;
  perTargetLimit: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
  allowFlashSale: boolean;
  allowGuest: boolean;
  categoryIds: string[];
  productIds: string[];
}

export const EMPTY_VOUCHER: VoucherFormValue = {
  id: "",
  code: "",
  description: "",
  discountType: "PERCENT",
  percentBp: 1000,
  amount: "0",
  minSpend: "0",
  quota: 0,
  perTargetLimit: 1,
  startAt: "",
  endAt: "",
  isActive: true,
  allowFlashSale: false,
  allowGuest: true,
  categoryIds: [],
  productIds: [],
};

/** Daftar centang bercakupan - dipakai pembatas kategori & produk. */
function ScopePicker({
  name,
  label,
  options,
  selected,
  onToggle,
}: {
  name: string;
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="max-h-40 overflow-y-auto rounded-lg border p-2">
        {options.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Belum ada data.</p>
        ) : (
          options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-foreground/[0.04]">
              {/* Input native, bukan komponen Checkbox: yang dibutuhkan di sini
                  banyak nilai pada SATU nama field (formData.getAll), dan itu
                  perilaku bawaan checkbox HTML. */}
              <input
                type="checkbox"
                name={name}
                value={o.id}
                checked={selected.includes(o.id)}
                onChange={() => onToggle(o.id)}
                className="size-4 accent-primary"
              />
              <span className="min-w-0 truncate">{o.label}</span>
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length === 0
          ? "Tidak ada yang dicentang = berlaku untuk semua."
          : `${selected.length} dipilih. Voucher hanya berlaku di sini.`}
      </p>
    </div>
  );
}

export function VoucherForm({
  initial,
  categories,
  products,
  action,
  onDone,
}: {
  initial: VoucherFormValue;
  categories: { id: string; label: string }[];
  products: { id: string; label: string }[];
  action: (formData: FormData) => Promise<ActionResult>;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => {
      const hasil = await action(formData);
      if (hasil.ok) onDone?.();
      return hasil;
    },
    INITIAL_STATE,
  );

  const [tipe, setTipe] = useState(initial.discountType);
  const [percentBp, setPercentBp] = useState(initial.percentBp);
  const [amount, setAmount] = useState(initial.amount);
  const [aktif, setAktif] = useState(initial.isActive);
  const [bolehFlash, setBolehFlash] = useState(initial.allowFlashSale);
  const [bolehTamu, setBolehTamu] = useState(initial.allowGuest);
  const [kategori, setKategori] = useState(initial.categoryIds);
  const [produk, setProduk] = useState(initial.productIds);

  function toggle(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={initial.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="v-code">Kode promo</Label>
          <Input
            id="v-code"
            name="code"
            defaultValue={initial.code}
            required
            placeholder="HEMAT10"
            className="font-mono uppercase"
          />
          <p className="text-xs text-muted-foreground">
            Huruf, angka, - dan _ saja. Otomatis disimpan huruf besar.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="v-desc">Catatan internal</Label>
          <Input id="v-desc" name="description" defaultValue={initial.description} placeholder="Promo Agustus" />
          <p className="text-xs text-muted-foreground">Tidak pernah dilihat pembeli.</p>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <Label>Jenis potongan</Label>
        <div className="flex flex-wrap gap-4">
          {(["PERCENT", "FIXED"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="discountType"
                value={t}
                checked={tipe === t}
                onChange={() => setTipe(t)}
                className="size-4 accent-primary"
              />
              {t === "PERCENT" ? "Persentase" : "Nominal tetap"}
            </label>
          ))}
        </div>

        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          {tipe === "PERCENT" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="v-percent">Potongan (%)</Label>
                <Input
                  id="v-percent"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={percentBp / 100}
                  onChange={(e) => setPercentBp(Math.round(Number(e.target.value) * 100))}
                />
                {/* Nilai yang benar-benar dikirim adalah basis poin, sama
                    dengan satuan yang dipakai seluruh perhitungan uang di repo
                    ini (calculateFee, applyMarkup, diskon tier). */}
                <input type="hidden" name="percentBp" value={percentBp} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-amount">Potongan maksimal (Rp)</Label>
                <Input
                  id="v-amount"
                  name="amount"
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  0 = tanpa batas. Isi ini untuk menahan potongan di item mahal.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="v-amount-fixed">Nominal potongan (Rp)</Label>
              <Input
                id="v-amount-fixed"
                name="amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Kalau lebih besar dari harga item, potongan otomatis dijepit ke harga — tagihan tidak
                pernah jadi minus.
              </p>
              <input type="hidden" name="percentBp" value={0} />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-minspend">Minimal harga item (Rp)</Label>
          <Input id="v-minspend" name="minSpend" type="number" min="0" defaultValue={initial.minSpend} />
          <p className="text-xs text-muted-foreground">0 = tanpa minimum.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-quota">Kuota total</Label>
          <Input id="v-quota" name="quota" type="number" min="0" defaultValue={initial.quota} />
          <p className="text-xs text-muted-foreground">0 = tak terbatas.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-pertarget">Maks. per nomor tujuan</Label>
          <Input
            id="v-pertarget"
            name="perTargetLimit"
            type="number"
            min="0"
            defaultValue={initial.perTargetLimit}
          />
          <p className="text-xs text-muted-foreground">
            Dihitung per nomor HP / ID akun game, bukan per email. 0 = tak terbatas.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="v-start">Mulai berlaku</Label>
          <Input id="v-start" name="startAt" type="datetime-local" defaultValue={initial.startAt} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-end">Berakhir</Label>
          <Input id="v-end" name="endAt" type="datetime-local" defaultValue={initial.endAt} />
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isActive" checked={aktif} onCheckedChange={(v) => setAktif(v === true)} />
          Aktif
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            name="allowFlashSale"
            checked={bolehFlash}
            onCheckedChange={(v) => setBolehFlash(v === true)}
            className="mt-0.5"
          />
          <span>
            Boleh dipakai di item yang sedang Flash Sale
            <span className="block text-xs text-muted-foreground">
              Bawaannya mati. Flash sale sudah memotong harga sekali — menumpuknya bisa menembus harga
              modal.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            name="allowGuest"
            checked={bolehTamu}
            onCheckedChange={(v) => setBolehTamu(v === true)}
            className="mt-0.5"
          />
          <span>
            Boleh dipakai pembeli tanpa akun
            <span className="block text-xs text-muted-foreground">
              Batas pemakaiannya tetap terjaga karena dihitung per nomor tujuan.
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ScopePicker
          name="categoryIds"
          label="Batasi ke kategori"
          options={categories}
          selected={kategori}
          onToggle={(id) => toggle(kategori, setKategori, id)}
        />
        <ScopePicker
          name="productIds"
          label="Batasi ke produk"
          options={products}
          selected={produk}
          onToggle={(id) => toggle(produk, setProduk, id)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Menyimpan..." : initial.id ? "Simpan Perubahan" : "Buat Voucher"}
        </Button>
        {tipe === "FIXED" && amount !== "0" && (
          <span className="text-xs text-muted-foreground">
            Potongan {formatRupiah(BigInt(amount || "0"))} per pesanan.
          </span>
        )}
      </div>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
