"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";

export interface ProductItemData {
  id: string;
  name: string;
  sellingPrice: string; // bigint diserialisasi jadi string dari Server Component
  memberPrice: string;
  sortOrder: number;
  isActive: boolean;
}

function ItemRow({
  productId,
  item,
  updateProductItem,
}: {
  productId: string;
  item: ProductItemData;
  updateProductItem: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(updateProductItem), INITIAL_STATE);

  return (
    <form
      action={action}
      className="grid grid-cols-[1fr_9rem_9rem_5rem_auto_auto] items-center gap-3 border-b px-3 py-2.5 last:border-0"
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
}: {
  productId: string;
  items: ProductItemData[];
  createProductItem: ServerAction;
  updateProductItem: ServerAction;
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
            <ItemRow key={item.id} productId={productId} item={item} updateProductItem={updateProductItem} />
          ))
        )}
      </div>

      <AddItemForm productId={productId} createProductItem={createProductItem} />
    </div>
  );
}
