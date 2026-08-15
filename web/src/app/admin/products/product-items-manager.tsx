"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { ChevronRight, Layers, Plus, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PROVIDER_LABELS, type CatalogSource } from "@/lib/providers/labels";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";
import { SkuPicker } from "./[id]/sku-picker";

export interface ProviderSkuData {
  id: string;
  provider: string;
  providerSkuCode: string;
  costPrice: string; // bigint diserialisasi jadi string dari Server Component
  status: string; // "ACTIVE" | "UNAVAILABLE"
  lastSyncedAtDisplay: string; // sudah diformat di server (hindari mismatch locale saat hidrasi)
  priority: number; // angka kecil dicoba lebih dulu saat fulfillment
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

const rupiah = (v: string | bigint) => `Rp ${Number(v).toLocaleString("id-ID")}`;

/**
 * Mana mapping yang sebenarnya akan dipakai duluan saat order masuk.
 *
 * Urutannya SENGAJA menyalin persis pemecah seri di selectFulfillmentSku
 * (priority → harga modal → nama provider). Kalau label di layar memakai aturan
 * yang berbeda dari yang dipakai mesin fulfillment, admin akan melihat "Utama"
 * di satu provider sementara order lari ke provider lain — persis jenis
 * ketidakcocokan yang paling lama ketahuannya.
 */
function primarySkuId(skus: ProviderSkuData[]): string | null {
  if (skus.length === 0) return null;
  const sorted = [...skus].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ca = BigInt(a.costPrice);
    const cb = BigInt(b.costPrice);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0;
  });
  return sorted[0].id;
}

/**
 * Modal termurah yang benar-benar akan dipakai, atau null kalau item belum
 * dipetakan ke provider mana pun. Dipakai baris ringkas untuk menghitung margin
 * tanpa harus membuka itemnya.
 */
function cheapestCost(skus: ProviderSkuData[]): bigint | null {
  if (skus.length === 0) return null;
  return skus.reduce<bigint>((min, s) => {
    const c = BigInt(s.costPrice);
    return c < min ? c : min;
  }, BigInt(skus[0].costPrice));
}

// Margin negatif = jual rugi. Risiko bisnis nyata, bukan kosmetik, jadi
// tampilannya sengaja mencolok: fill + border + ikon + kata "Jual rugi", bukan
// sekadar teks merah (color-not-only).
function MarginBadge({ margin, label = "Margin" }: { margin: bigint; label?: string }) {
  if (margin < BigInt(0)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-destructive bg-destructive/15 px-1.5 py-0.5 text-xs font-semibold text-destructive">
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        Jual rugi {rupiah(-margin)}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
      {label} {rupiah(margin)}
    </span>
  );
}

function ProviderSkuRow({
  item,
  sku,
  isPrimary,
  showPrimaryControl,
  unmapProviderSku,
  setPrimaryProviderSku,
}: {
  item: ProductItemData;
  sku: ProviderSkuData;
  isPrimary: boolean;
  showPrimaryControl: boolean;
  unmapProviderSku: ServerAction;
  setPrimaryProviderSku: ServerAction;
}) {
  const [state, action, pending] = useActionState(withPrevState(unmapProviderSku), INITIAL_STATE);
  const [primaryState, primaryAction, primaryPending] = useActionState(
    withPrevState(setPrimaryProviderSku),
    INITIAL_STATE,
  );
  const margin = BigInt(item.sellingPrice) - BigInt(sku.costPrice);

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 text-sm ring-1",
        margin < BigInt(0) ? "bg-destructive/10 ring-destructive/40" : "ring-foreground/10",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{PROVIDER_LABELS[sku.provider as keyof typeof PROVIDER_LABELS] ?? sku.provider}</span>
        {showPrimaryControl && <Badge variant={isPrimary ? "success" : "muted"}>{isPrimary ? "Utama" : "Cadangan"}</Badge>}
        <Badge variant={sku.status === "ACTIVE" ? "success" : "muted"}>
          {sku.status === "ACTIVE" ? "Aktif" : "Tidak tersedia"}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {showPrimaryControl && !isPrimary && (
            <form action={primaryAction}>
              <input type="hidden" name="id" value={sku.id} />
              <Button type="submit" size="xs" variant="outline" disabled={primaryPending}>
                {primaryPending ? "Menyetel..." : "Jadikan utama"}
              </Button>
            </form>
          )}
          <form action={action}>
            <input type="hidden" name="id" value={sku.id} />
            <Button type="submit" size="xs" variant="ghost" disabled={pending}>
              {pending ? "Menghapus..." : "Hapus"}
            </Button>
          </form>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono">{sku.providerSkuCode}</span>
        <span className="tabular-nums">Modal {rupiah(sku.costPrice)}</span>
        <MarginBadge margin={margin} />
        <span>Sync: {sku.lastSyncedAtDisplay}</span>
      </div>
      {(state.ok || state.error || primaryState.ok || primaryState.error) && (
        <div className="mt-1">
          <ActionMessage state={state.ok || state.error ? state : primaryState} />
        </div>
      )}
    </div>
  );
}

/**
 * Pencari SKU dalam DIALOG, bukan disisipkan ke dalam baris.
 *
 * Sebelumnya picker terbuka inline di tengah daftar item: seluruh isi halaman
 * terdorong turun, posisi baca hilang, dan tabel hasil pencarian bertumpuk
 * dengan tabel item di belakangnya. Dialog memberi picker ruang penuh dan
 * mengembalikan layar ke keadaan semula begitu ditutup.
 */
function SkuPickerDialog({
  item,
  sources,
  mapProviderSku,
}: {
  item: ProductItemData;
  sources: CatalogSource[];
  mapProviderSku: ServerAction;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" size="xs" variant="outline">
            <Plus className="size-3.5" aria-hidden="true" />
            Petakan SKU
          </Button>
        }
      />
      <DialogContent
        title={`Petakan SKU — ${item.name}`}
        description={`Harga jual item ini ${rupiah(item.sellingPrice)}. Pilih SKU provider yang akan mengirimnya.`}
      >
        <SkuPicker productItemId={item.id} sources={sources} mapProviderSku={mapProviderSku} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Satu item, ringkas secara bawaan.
 *
 * Sebelumnya SETIAP item selalu terbuka penuh: form harga, pilihan grup, pemicu
 * flash sale, blok pemetaan SKU, dan tombol per mapping — semuanya sekaligus.
 * Untuk produk pulsa berisi 30 item itu sekitar 180 kontrol menumpuk tanpa
 * pemisah, dan tiap kelompok tombol terlihat sama persis dengan kelompok di
 * atasnya. Itulah "tembok tombol" yang bikin halaman ini sulit dibaca.
 *
 * Sekarang bawaannya satu baris rangkuman yang menjawab pertanyaan yang paling
 * sering ditanyakan sekilas — nama, harga, untung/rugi, aktif, sudah dipetakan
 * atau belum — dan detailnya baru muncul saat item itu dibuka.
 */
function ItemRow({
  productId,
  item,
  groups,
  sources,
  updateProductItem,
  mapProviderSku,
  unmapProviderSku,
  setPrimaryProviderSku,
}: {
  productId: string;
  item: ProductItemData;
  groups: ProductItemGroupData[];
  sources: CatalogSource[];
  updateProductItem: ServerAction;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
  setPrimaryProviderSku: ServerAction;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(withPrevState(updateProductItem), INITIAL_STATE);

  const cost = cheapestCost(item.providerSkus);
  const margin = cost === null ? null : BigInt(item.sellingPrice) - cost;
  const showPrimaryControl = item.providerSkus.length > 1;
  const primaryId = primarySkuId(item.providerSkus);
  const panelId = `item-panel-${item.id}`;

  return (
    <div className={cn("rounded-xl ring-1 transition-colors", open ? "ring-primary/40" : "ring-foreground/10")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronRight
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{rupiah(item.sellingPrice)}</span>
            {margin === null ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                Belum dipetakan
              </span>
            ) : (
              <MarginBadge margin={margin} />
            )}
            {item.flashPrice && (
              <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                <Zap className="size-3.5" aria-hidden="true" />
                Flash
              </span>
            )}
          </span>
        </span>
        <Badge variant={item.isActive ? "success" : "muted"}>{item.isActive ? "Aktif" : "Nonaktif"}</Badge>
        <Badge variant={item.providerSkus.length > 0 ? "muted" : "warning"}>
          {item.providerSkus.length} SKU
        </Badge>
      </button>

      {open && (
        <div id={panelId} className="border-t px-3 py-3">
          <Tabs defaultValue="harga">
            <TabsList>
              <TabsTab value="harga">Harga &amp; status</TabsTab>
              <TabsTab value="provider">Provider ({item.providerSkus.length})</TabsTab>
              <TabsTab value="flash">Flash sale</TabsTab>
            </TabsList>

            {/*
              SATU form membungkus tab "Harga" DAN "Flash" karena keduanya disimpan
              oleh action yang sama (updateProductItem menerima harga sekaligus
              field flash). Panel-panelnya keepMounted — lihat catatan di
              components/ui/tabs.tsx: kalau panel tak aktif dilepas dari DOM,
              menyimpan dari satu tab akan mengosongkan field milik tab lain.

              Tab "Provider" sengaja DI LUAR form ini: isinya form-form sendiri
              (hapus mapping, jadikan utama), dan <form> tidak boleh bersarang.
            */}
            <form action={action} className="mt-3">
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="productId" value={productId} />

              <TabsPanel value="harga" className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`name-${item.id}`}>Nama item</Label>
                    <Input id={`name-${item.id}`} name="name" defaultValue={item.name} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`sellingPrice-${item.id}`}>Harga jual</Label>
                    <Input
                      id={`sellingPrice-${item.id}`}
                      name="sellingPrice"
                      defaultValue={item.sellingPrice}
                      inputMode="numeric"
                      className="tabular-nums"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`memberPrice-${item.id}`}>Batas bawah harga</Label>
                    {/* Nama field-nya tetap `memberPrice` (kolom DB tidak diubah
                        supaya tidak perlu migrasi). Yang berubah cuma LABEL-nya,
                        karena sejak Fase B angka ini bukan lagi "harga untuk
                        member" — dia batas bawah yang tidak boleh ditembus diskon
                        tier. Lihat effectivePrice(). */}
                    <Input
                      id={`memberPrice-${item.id}`}
                      name="memberPrice"
                      defaultValue={item.memberPrice}
                      inputMode="numeric"
                      className="tabular-nums"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Diskon tier member tidak akan pernah menembus angka ini.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`sortOrder-${item.id}`}>Urutan tampil</Label>
                    <Input
                      id={`sortOrder-${item.id}`}
                      name="sortOrder"
                      defaultValue={item.sortOrder}
                      inputMode="numeric"
                      className="tabular-nums"
                    />
                  </div>
                  {groups.length > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`groupId-${item.id}`}>Grup</Label>
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
                </div>
                <label className="flex w-fit items-center gap-2 text-sm">
                  <Checkbox name="isActive" defaultChecked={item.isActive} />
                  Tampilkan item ini di katalog
                </label>
              </TabsPanel>

              <TabsPanel value="flash" className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Kosongkan harga flash untuk menonaktifkan. Harga flash tetap dibandingkan dengan harga modal —
                  kalau di bawahnya, peringatan jual rugi muncul sebelum flash-nya jalan.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`flashPrice-${item.id}`}>Harga flash</Label>
                    <Input
                      id={`flashPrice-${item.id}`}
                      name="flashPrice"
                      defaultValue={item.flashPrice}
                      inputMode="numeric"
                      placeholder="Kosongkan = nonaktif"
                      className="tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`flashStartAt-${item.id}`}>Mulai</Label>
                    <Input
                      id={`flashStartAt-${item.id}`}
                      name="flashStartAt"
                      type="datetime-local"
                      defaultValue={item.flashStartAt}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`flashEndAt-${item.id}`}>Selesai</Label>
                    <Input
                      id={`flashEndAt-${item.id}`}
                      name="flashEndAt"
                      type="datetime-local"
                      defaultValue={item.flashEndAt}
                    />
                  </div>
                </div>
                {item.flashPrice && cost !== null && (
                  <MarginBadge margin={BigInt(item.flashPrice) - cost} label="Margin saat flash" />
                )}
              </TabsPanel>

              {/* Satu tombol simpan untuk kedua tab di atas — bukan satu per
                  bagian. Dulu tiap baris item punya tombol Simpan sendiri, jadi
                  mengubah 10 harga berarti 10 kali menekan Simpan. */}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Menyimpan..." : "Simpan perubahan"}
                </Button>
                <ActionMessage state={state} />
              </div>
            </form>

            <TabsPanel value="provider" className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Provider yang akan mengirim item ini saat ada order.
                </p>
                <SkuPickerDialog item={item} sources={sources} mapProviderSku={mapProviderSku} />
              </div>

              {item.providerSkus.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  Belum dipetakan ke provider mana pun — item ini belum bisa dikirim otomatis.
                </p>
              ) : (
                item.providerSkus.map((sku) => (
                  <ProviderSkuRow
                    key={sku.id}
                    item={item}
                    sku={sku}
                    isPrimary={sku.id === primaryId}
                    showPrimaryControl={showPrimaryControl}
                    unmapProviderSku={unmapProviderSku}
                    setPrimaryProviderSku={setPrimaryProviderSku}
                  />
                ))
              )}

              {showPrimaryControl && (
                <p className="text-xs text-muted-foreground">
                  <strong>Utama</strong> dicoba lebih dulu. <strong>Cadangan</strong> hanya dipakai kalau yang utama
                  gagal karena sebab yang dipastikan belum menyentuh produk (IP belum terdaftar, saldo provider
                  kurang, produk gangguan) — bukan untuk kegagalan yang statusnya tidak jelas.
                </p>
              )}
            </TabsPanel>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function AddItemDialog({ productId, createProductItem }: { productId: string; createProductItem: ServerAction }) {
  const [state, action, pending] = useActionState(withPrevState(createProductItem), INITIAL_STATE);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Tambah item
          </Button>
        }
      />
      <DialogContent
        title="Tambah item baru"
        description="Flash sale, grup, dan pemetaan provider diatur setelah item ini dibuat."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="productId" value={productId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-item-name">Nama item</Label>
              <Input id="new-item-name" name="name" required placeholder="86 Diamonds" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-item-selling">Harga jual</Label>
              <Input id="new-item-selling" name="sellingPrice" inputMode="numeric" required placeholder="22000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-item-member">Batas bawah harga</Label>
              <Input id="new-item-member" name="memberPrice" inputMode="numeric" required placeholder="21500" />
              <p className="text-xs text-muted-foreground">
                Diskon tier member tidak akan pernah menembus angka ini.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-item-sort">Urutan tampil</Label>
              <Input id="new-item-sort" name="sortOrder" inputMode="numeric" defaultValue={0} />
            </div>
          </div>
          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox name="isActive" defaultChecked />
            Langsung tampilkan di katalog
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Menambah..." : "Tambah item"}
            </Button>
            <ActionMessage state={state} />
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
        <p className="w-full text-xs text-destructive">{updateState.error || deleteState.error}</p>
      )}
    </div>
  );
}

/**
 * Grup item — dipindah ke dialog.
 *
 * Fitur opsional yang jarang disentuh, tapi dulu menempati blok permanen di
 * paling atas daftar item, lengkap dengan form "grup baru" yang selalu terbuka.
 * Akibatnya hal yang paling sering dikerjakan (mengurus item) selalu terdorong
 * ke bawah oleh hal yang paling jarang dikerjakan.
 */
function GroupsDialog({
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
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Layers className="size-4" aria-hidden="true" />
            Grup{groups.length > 0 && ` (${groups.length})`}
          </Button>
        }
      />
      <DialogContent
        title="Grup item"
        description='Opsional — kelompokkan item (mis. "Diamond" vs "Membership"). Item tanpa grup tetap tampil, di bagian tanpa judul. Menghapus grup tidak menghapus item di dalamnya.'
      >
        <div className="space-y-4">
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
          <form action={createAction} className="flex flex-wrap items-end gap-2 border-t pt-4">
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
      </DialogContent>
    </Dialog>
  );
}

export function ProductItemsManager({
  productId,
  items,
  groups,
  sources,
  createProductItem,
  updateProductItem,
  mapProviderSku,
  unmapProviderSku,
  setPrimaryProviderSku,
  createProductItemGroup,
  updateProductItemGroup,
  deleteProductItemGroup,
}: {
  productId: string;
  items: ProductItemData[];
  groups: ProductItemGroupData[];
  sources: CatalogSource[];
  createProductItem: ServerAction;
  updateProductItem: ServerAction;
  mapProviderSku: ServerAction;
  unmapProviderSku: ServerAction;
  setPrimaryProviderSku: ServerAction;
  createProductItemGroup: ServerAction;
  updateProductItemGroup: ServerAction;
  deleteProductItemGroup: ServerAction;
}) {
  // Dua angka yang paling menentukan apakah produk ini siap dijual, dihitung
  // sekali di atas supaya admin tidak perlu membuka 30 item satu per satu untuk
  // menemukan yang bermasalah.
  const { unmapped, loss } = useMemo(() => {
    let unmapped = 0;
    let loss = 0;
    for (const item of items) {
      const cost = cheapestCost(item.providerSkus);
      if (cost === null) unmapped++;
      else if (BigInt(item.sellingPrice) - cost < BigInt(0)) loss++;
    }
    return { unmapped, loss };
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {items.length} item
          {items.length > 0 && (unmapped > 0 || loss > 0) && " — "}
          {unmapped > 0 && <span className="text-amber-700 dark:text-amber-400">{unmapped} belum dipetakan</span>}
          {unmapped > 0 && loss > 0 && ", "}
          {loss > 0 && <span className="font-medium text-destructive">{loss} jual rugi</span>}
        </p>
        <div className="flex items-center gap-2">
          <GroupsDialog
            productId={productId}
            groups={groups}
            createProductItemGroup={createProductItemGroup}
            updateProductItemGroup={updateProductItemGroup}
            deleteProductItemGroup={deleteProductItemGroup}
          />
          <AddItemDialog productId={productId} createProductItem={createProductItem} />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
          Belum ada item. Tambahkan minimal satu item sebelum mengaktifkan produk.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              productId={productId}
              item={item}
              groups={groups}
              sources={sources}
              updateProductItem={updateProductItem}
              mapProviderSku={mapProviderSku}
              unmapProviderSku={unmapProviderSku}
              setPrimaryProviderSku={setPrimaryProviderSku}
            />
          ))}
        </div>
      )}
    </div>
  );
}
