"use client";

import { useState } from "react";
import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";
import { SkuPicker } from "./[id]/sku-picker";

// Duplikasi kecil dari sku-picker.tsx — lihat catatan di sana soal kenapa
// daftar 4 provider ini tidak diekstrak ke modul bersama.
const PROVIDER_LABELS: Record<string, string> = {
  DIGIFLAZZ: "Digiflazz",
  OKECONNECT: "OkeConnect",
  QIOSPAY: "QiosPay",
  SERPUL: "Serpul",
};

export interface ProviderSkuData {
  id: string;
  provider: string;
  providerSkuCode: string;
  costPrice: string; // bigint diserialisasi jadi string dari Server Component
  status: string; // "ACTIVE" | "UNAVAILABLE"
  lastSyncedAtDisplay: string; // sudah diformat di server (hindari mismatch locale saat hidrasi)
}

export interface ProductItemData {
  id: string;
  name: string;
  sellingPrice: string; // bigint diserialisasi jadi string dari Server Component
  memberPrice: string;
  sortOrder: number;
  isActive: boolean;
  providerSkus: ProviderSkuData[];
}

// Margin = sellingPrice − costPrice. Margin negatif berarti jual rugi — risiko
// bisnis nyata, bukan sekadar kosmetik, jadi tampilannya sengaja mencolok:
// border tebal + fill merah di seluruh baris + ikon peringatan + label tegas
// "Jual rugi", bukan cuma teks berwarna merah (lihat panduan ui-ux-pro-max:
// color-not-only + destructive-emphasis + contrast-feedback).
function MarginIndicator({ sellingPrice, costPrice }: { sellingPrice: bigint; costPrice: bigint }) {
  const margin = sellingPrice - costPrice;
  const isLoss = margin < BigInt(0);

  if (isLoss) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border-2 border-destructive bg-destructive/20 px-2 py-1">
        <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span className="text-xs font-bold text-destructive">
          Jual rugi Rp {(-margin).toLocaleString("id-ID")}
        </span>
      </div>
    );
  }

  return (
    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
      Margin Rp {margin.toLocaleString("id-ID")}
    </span>
  );
}

function ProviderSkuRow({
  item,
  sku,
  unmapProviderSku,
}: {
  item: ProductItemData;
  sku: ProviderSkuData;
  unmapProviderSku: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(unmapProviderSku), INITIAL_STATE);
  const sellingPrice = BigInt(item.sellingPrice);
  const costPrice = BigInt(sku.costPrice);
  const isLoss = sellingPrice - costPrice < BigInt(0);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg px-3 py-2 text-sm ring-1",
        isLoss ? "bg-destructive/10 ring-destructive/40" : "ring-foreground/10",
      )}
    >
      <span className="font-medium">{PROVIDER_LABELS[sku.provider] ?? sku.provider}</span>
      <span className="font-mono text-xs text-muted-foreground">{sku.providerSkuCode}</span>
      <span className="tabular-nums text-xs text-muted-foreground">
        Modal Rp {costPrice.toLocaleString("id-ID")}
      </span>
      <Badge variant={sku.status === "ACTIVE" ? "success" : "muted"}>
        {sku.status === "ACTIVE" ? "Aktif" : "Tidak tersedia"}
      </Badge>
      <span className="text-xs text-muted-foreground">Sync: {sku.lastSyncedAtDisplay}</span>

      <MarginIndicator sellingPrice={sellingPrice} costPrice={costPrice} />

      <form action={action} className="ml-auto flex items-center gap-2">
        <input type="hidden" name="id" value={sku.id} />
        <Button type="submit" size="xs" variant="ghost" disabled={pending}>
          {pending ? "Menghapus..." : "Hapus"}
        </Button>
      </form>
      {(state.ok || state.error) && (
        <div className="w-full">
          <ActionMessage state={state} />
        </div>
      )}
    </div>
  );
}

function SkuMappingSection({
  item,
  mapProviderSku,
  unmapProviderSku,
}: {
  item: ProductItemData;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2 border-t px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Pemetaan SKU provider {item.providerSkus.length > 0 && `(${item.providerSkus.length})`}
        </p>
        <Button type="button" size="xs" variant="outline" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? "Tutup pencarian" : "Petakan SKU"}
        </Button>
      </div>

      {item.providerSkus.length > 0 ? (
        <div className="space-y-1.5">
          {item.providerSkus.map((sku) => (
            <ProviderSkuRow key={sku.id} item={item} sku={sku} unmapProviderSku={unmapProviderSku} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Belum ada mapping provider untuk item ini.</p>
      )}

      {pickerOpen && <SkuPicker productItemId={item.id} mapProviderSku={mapProviderSku} />}
    </div>
  );
}

function ItemRow({
  productId,
  item,
  updateProductItem,
  mapProviderSku,
  unmapProviderSku,
}: {
  productId: string;
  item: ProductItemData;
  updateProductItem: ServerAction;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(updateProductItem), INITIAL_STATE);

  return (
    <div className="border-b last:border-0">
      <form
        action={action}
        className="grid grid-cols-[1fr_9rem_9rem_5rem_auto_auto] items-center gap-3 px-3 py-2.5"
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="productId" value={productId} />

        <Input name="name" defaultValue={item.name} aria-label="Nama item" required />
        <div className="flex flex-col gap-1">
          <Input
            name="sellingPrice"
            defaultValue={item.sellingPrice}
            inputMode="numeric"
            aria-label="Harga jual"
            className="tabular-nums"
            required
          />
          <span className="text-xs text-muted-foreground">
            Rp {Number(item.sellingPrice).toLocaleString("id-ID")}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Input
            name="memberPrice"
            defaultValue={item.memberPrice}
            inputMode="numeric"
            aria-label="Harga member"
            className="tabular-nums"
            required
          />
          <span className="text-xs text-muted-foreground">
            Rp {Number(item.memberPrice).toLocaleString("id-ID")}
          </span>
        </div>
        <Input
          name="sortOrder"
          defaultValue={item.sortOrder}
          inputMode="numeric"
          aria-label="Urutan"
          className="tabular-nums"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox name="isActive" defaultChecked={item.isActive} />
          Aktif
        </label>

        <div className="flex items-center gap-2 justify-self-end">
          <Button type="submit" size="xs" variant="outline" disabled={pending}>
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
        {(state.ok || state.error) && (
          <div className="col-span-6">
            <ActionMessage state={state} />
          </div>
        )}
      </form>
      <SkuMappingSection item={item} mapProviderSku={mapProviderSku} unmapProviderSku={unmapProviderSku} />
    </div>
  );
}

function AddItemForm({
  productId,
  createProductItem,
}: {
  productId: string;
  createProductItem: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(createProductItem), INITIAL_STATE);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-dashed p-3">
      <input type="hidden" name="productId" value={productId} />
      <p className="text-sm font-medium">Tambah item baru</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-item-name">Nama item</Label>
          <Input id="new-item-name" name="name" required placeholder="86 Diamonds" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-item-selling">Harga jual</Label>
          <Input id="new-item-selling" name="sellingPrice" inputMode="numeric" required placeholder="22000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-item-member">Harga member</Label>
          <Input id="new-item-member" name="memberPrice" inputMode="numeric" required placeholder="21500" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-item-sort">Urutan</Label>
          <Input id="new-item-sort" name="sortOrder" inputMode="numeric" defaultValue={0} />
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox name="isActive" defaultChecked />
        Aktifkan item ini
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menambah..." : "Tambah item"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ProductItemsManager({
  productId,
  items,
  createProductItem,
  updateProductItem,
  mapProviderSku,
  unmapProviderSku,
}: {
  productId: string;
  items: ProductItemData[];
  createProductItem: ServerAction;
  updateProductItem: ServerAction;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl ring-1 ring-foreground/10">
        <div className="grid grid-cols-[1fr_9rem_9rem_5rem_auto_auto] gap-3 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Nama</span>
          <span>Harga jual</span>
          <span>Harga member</span>
          <span>Urutan</span>
          <span>Status</span>
          <span className="justify-self-end">Aksi</span>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Belum ada item. Tambahkan minimal satu item sebelum mengaktifkan produk.
          </p>
        ) : (
          items.map((item) => (
            <ItemRow
              key={item.id}
              productId={productId}
              item={item}
              updateProductItem={updateProductItem}
              mapProviderSku={mapProviderSku}
              unmapProviderSku={unmapProviderSku}
            />
          ))
        )}
      </div>

      <AddItemForm productId={productId} createProductItem={createProductItem} />
    </div>
  );
}
