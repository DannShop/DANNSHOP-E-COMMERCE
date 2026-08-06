"use client";

import { useState } from "react";
import { useActionState } from "react";
import { TriangleAlert, ChevronDown, ChevronUp, Zap } from "lucide-react";
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

export interface ProductItemGroupData {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ProductItemData {
  id: string;
  name: string;
  sellingPrice: string; // bigint diserialisasi jadi string dari Server Component
  memberPrice: string;
  sortOrder: number;
  isActive: boolean;
  flashPrice: string; // "" kalau tidak ada flash sale
  flashStartAt: string; // format datetime-local ("" kalau kosong)
  flashEndAt: string;
  groupId: string; // "" kalau tanpa grup
  providerSkus: ProviderSkuData[];
}

// Margin = sellingPrice − costPrice. Margin negatif berarti jual rugi — risiko
// bisnis nyata, bukan sekadar kosmetik, jadi tampilannya sengaja mencolok:
// border tebal + fill merah di seluruh baris + ikon peringatan + label tegas
// "Jual rugi", bukan cuma teks berwarna merah (lihat panduan ui-ux-pro-max:
// color-not-only + destructive-emphasis + contrast-feedback).
function MarginIndicator({
  sellingPrice,
  costPrice,
  flashPrice,
}: {
  sellingPrice: bigint;
  costPrice: bigint;
  flashPrice?: bigint | null;
}) {
  const margin = sellingPrice - costPrice;
  const isLoss = margin < BigInt(0);
  // Margin saat flash dicek terpisah — supaya admin tetap lihat risiko jual
  // rugi meskipun harga normal masih untung (harga flash yang diisi terlalu
  // rendah baru ketahuan di sini, sebelum flash sale-nya benar-benar aktif).
  const flashMargin = flashPrice != null ? flashPrice - costPrice : null;
  const flashIsLoss = flashMargin != null && flashMargin < BigInt(0);

  return (
    <div className="flex flex-col gap-1">
      {isLoss ? (
        <div className="flex items-center gap-1.5 rounded-md border-2 border-destructive bg-destructive/20 px-2 py-1">
          <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <span className="text-xs font-bold text-destructive">
            Jual rugi Rp {(-margin).toLocaleString("id-ID")}
          </span>
        </div>
      ) : (
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Margin Rp {margin.toLocaleString("id-ID")}
        </span>
      )}
      {flashMargin != null &&
        (flashIsLoss ? (
          <div className="flex items-center gap-1.5 rounded-md border-2 border-destructive bg-destructive/20 px-2 py-1">
            <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="text-xs font-bold text-destructive">
              Jual rugi saat flash Rp {(-flashMargin).toLocaleString("id-ID")}
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Margin saat flash Rp {flashMargin.toLocaleString("id-ID")}
          </span>
        ))}
    </div>
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

      <MarginIndicator
        sellingPrice={sellingPrice}
        costPrice={costPrice}
        flashPrice={item.flashPrice ? BigInt(item.flashPrice) : null}
      />

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

// Field flash sale disembunyikan di balik tombol expand supaya baris utama
// tetap ringkas (mayoritas item tidak pernah pakai flash sale) — otomatis
// terbuka kalau item ini sudah punya flash sale tersimpan, biar admin nggak
// perlu klik dulu buat lihat konfigurasi yang sudah ada.
function FlashSaleFields({ item }: { item: ProductItemData }) {
  const [open, setOpen] = useState(Boolean(item.flashPrice));

  return (
    <div className="col-span-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Zap className="size-3.5" aria-hidden="true" />
        Atur flash sale
        {open ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
      </button>
      {open && (
        <div className="mt-2 grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor={`flashPrice-${item.id}`} className="text-xs">
              Harga flash
            </Label>
            <Input
              id={`flashPrice-${item.id}`}
              name="flashPrice"
              defaultValue={item.flashPrice}
              inputMode="numeric"
              placeholder="Kosongkan untuk nonaktifkan"
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`flashStartAt-${item.id}`} className="text-xs">
              Mulai
            </Label>
            <Input
              id={`flashStartAt-${item.id}`}
              name="flashStartAt"
              type="datetime-local"
              defaultValue={item.flashStartAt}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`flashEndAt-${item.id}`} className="text-xs">
              Selesai
            </Label>
            <Input id={`flashEndAt-${item.id}`} name="flashEndAt" type="datetime-local" defaultValue={item.flashEndAt} />
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  productId,
  item,
  groups,
  updateProductItem,
  mapProviderSku,
  unmapProviderSku,
}: {
  productId: string;
  item: ProductItemData;
  groups: ProductItemGroupData[];
  updateProductItem: ServerAction;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(updateProductItem), INITIAL_STATE);

  return (
    <div className="border-b last:border-0">
      <form action={action} className="grid grid-cols-1 items-center gap-3 px-3 py-2.5 sm:grid-cols-[1fr_9rem_9rem_5rem_auto_auto]">
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

        {groups.length > 0 && (
          <div className="col-span-full space-y-1 sm:col-span-3">
            <Label htmlFor={`groupId-${item.id}`} className="text-xs text-muted-foreground">
              Grup
            </Label>
            <select
              id={`groupId-${item.id}`}
              name="groupId"
              defaultValue={item.groupId}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Tanpa grup</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <FlashSaleFields item={item} />

        {(state.ok || state.error) && (
          <div className="col-span-full">
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
      <p className="text-xs text-muted-foreground">
        Flash sale &amp; grup bisa diatur setelah item ditambahkan, lewat baris item di atas.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menambah..." : "Tambah item"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function GroupRow({
  productId,
  group,
  updateProductItemGroup,
  deleteProductItemGroup,
}: {
  productId: string;
  group: ProductItemGroupData;
  updateProductItemGroup: ServerAction;
  deleteProductItemGroup: ServerAction;
}) {
  const [updateState, updateAction, updatePending] = useActionState(withPrevState(updateProductItemGroup), INITIAL_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(withPrevState(deleteProductItemGroup), INITIAL_STATE);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={updateAction} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={group.id} />
        <input type="hidden" name="productId" value={productId} />
        <Input name="name" defaultValue={group.name} aria-label="Nama grup" className="max-w-48" required />
        <Input
          name="sortOrder"
          defaultValue={group.sortOrder}
          inputMode="numeric"
          aria-label="Urutan grup"
          className="w-20 tabular-nums"
        />
        <Button type="submit" size="xs" variant="outline" disabled={updatePending}>
          {updatePending ? "Menyimpan..." : "Simpan"}
        </Button>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={group.id} />
        <input type="hidden" name="productId" value={productId} />
        <Button type="submit" size="xs" variant="ghost" disabled={deletePending}>
          {deletePending ? "Menghapus..." : "Hapus"}
        </Button>
      </form>
      {(updateState.error || deleteState.error) && (
        <p className="w-full text-xs text-danger-foreground">{updateState.error || deleteState.error}</p>
      )}
    </div>
  );
}

function GroupsManager({
  productId,
  groups,
  createProductItemGroup,
  updateProductItemGroup,
  deleteProductItemGroup,
}: {
  productId: string;
  groups: ProductItemGroupData[];
  createProductItemGroup: ServerAction;
  updateProductItemGroup: ServerAction;
  deleteProductItemGroup: ServerAction;
}) {
  const [createState, createAction, createPending] = useActionState(withPrevState(createProductItemGroup), INITIAL_STATE);

  return (
    <div className="space-y-3 rounded-xl border border-dashed p-3">
      <div>
        <p className="text-sm font-medium">Grup item</p>
        <p className="text-xs text-muted-foreground">
          Opsional — kelompokkan item (mis. &quot;Diamond&quot; vs &quot;Membership&quot;). Item tanpa grup tetap
          tampil di halaman produk, di bagian tanpa judul. Hapus grup tidak menghapus item di dalamnya.
        </p>
      </div>
      {groups.length > 0 && (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              productId={productId}
              group={g}
              updateProductItemGroup={updateProductItemGroup}
              deleteProductItemGroup={deleteProductItemGroup}
            />
          ))}
        </div>
      )}
      <form action={createAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="productId" value={productId} />
        <div className="space-y-1">
          <Label htmlFor="new-group-name" className="text-xs">
            Grup baru
          </Label>
          <Input id="new-group-name" name="name" placeholder="Diamond" className="max-w-48" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-group-sort" className="text-xs">
            Urutan
          </Label>
          <Input id="new-group-sort" name="sortOrder" inputMode="numeric" defaultValue={0} className="w-20 tabular-nums" />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={createPending}>
          {createPending ? "Menambah..." : "Tambah grup"}
        </Button>
      </form>
      <ActionMessage state={createState} />
    </div>
  );
}

export function ProductItemsManager({
  productId,
  items,
  groups,
  createProductItem,
  updateProductItem,
  mapProviderSku,
  unmapProviderSku,
  createProductItemGroup,
  updateProductItemGroup,
  deleteProductItemGroup,
}: {
  productId: string;
  items: ProductItemData[];
  groups: ProductItemGroupData[];
  createProductItem: ServerAction;
  updateProductItem: ServerAction;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
  createProductItemGroup: ServerAction;
  updateProductItemGroup: ServerAction;
  deleteProductItemGroup: ServerAction;
}) {
  return (
    <div className="space-y-4">
      <GroupsManager
        productId={productId}
        groups={groups}
        createProductItemGroup={createProductItemGroup}
        updateProductItemGroup={updateProductItemGroup}
        deleteProductItemGroup={deleteProductItemGroup}
      />

      <div className="rounded-xl ring-1 ring-foreground/10">
        <div className="hidden gap-3 border-b px-3 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_9rem_9rem_5rem_auto_auto]">
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
              groups={groups}
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
