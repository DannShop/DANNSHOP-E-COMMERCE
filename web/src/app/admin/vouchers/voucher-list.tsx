"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatRupiah } from "@/lib/format";
import { VoucherForm, EMPTY_VOUCHER, type VoucherFormValue } from "./voucher-form";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export interface VoucherRow extends VoucherFormValue {
  usedCount: number;
  /** Sudah lewat tanggal berakhirnya. Dihitung di SERVER supaya jam server yang menentukan. */
  expired: boolean;
}

function ringkasPotongan(v: VoucherRow): string {
  if (v.discountType === "FIXED") return formatRupiah(BigInt(v.amount || "0"));
  const persen = v.percentBp / 100;
  const batas = BigInt(v.amount || "0");
  return batas > 0n ? `${persen}% (maks ${formatRupiah(batas)})` : `${persen}%`;
}

/**
 * Tombol aksi satu baris voucher.
 *
 * Masing-masing berupa <form> tersendiri dengan Server Action, bukan pemanggilan
 * fungsi lewat onClick - pola yang sudah dipakai di seluruh panel ini, dan yang
 * membuat ConfirmSubmit bisa menghubungkan tombolnya lewat atribut `form`
 * meskipun dialognya dirender di portal, di luar form ini.
 */
function RowActions({
  voucher,
  onEdit,
  deleteAction,
  toggleAction,
}: {
  voucher: VoucherRow;
  onEdit: () => void;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  toggleAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const toast = useToast();
  const [toggleState, toggleForm, togglePending] = useActionState(
    (_p: ActionResult, fd: FormData) => toggleAction(fd),
    INITIAL_STATE,
  );
  const [deleteState, deleteForm, deletePending] = useActionState(
    (_p: ActionResult, fd: FormData) => deleteAction(fd),
    INITIAL_STATE,
  );

  // Kabar BERHASIL lewat toast; error TIDAK - lihat catatan di ui/toast.tsx.
  // Penolakan hapus menyebut berapa kali vouchernya sudah dipakai, dan
  // keterangan semacam itu tidak boleh menghilang sendiri setelah 7 detik.
  useEffect(() => {
    if (toggleState.ok) toast({ message: toggleState.ok });
  }, [toggleState, toast]);
  useEffect(() => {
    if (deleteState.ok) toast({ message: deleteState.ok });
  }, [deleteState, toast]);

  const formId = `hapus-voucher-${voucher.id}`;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>

        <form action={toggleForm}>
          <input type="hidden" name="id" value={voucher.id} />
          <Button type="submit" variant="outline" size="sm" disabled={togglePending}>
            <Power className="size-3.5" aria-hidden="true" />
            {voucher.isActive ? "Matikan" : "Aktifkan"}
          </Button>
        </form>

        <form action={deleteForm} id={formId} />
        <ConfirmSubmit
          formId={formId}
          confirmLabel="Hapus voucher"
          title={`Hapus voucher ${voucher.code}?`}
          description={
            <>
              <p>
                Voucher ini akan hilang dari daftar dan kodenya tidak bisa dipakai lagi oleh siapa pun.
              </p>
              <p>
                Kalau sudah pernah dipakai pembeli, penghapusan akan DITOLAK — matikan saja lewat tombol
                Matikan supaya riwayat pesanannya tetap bisa dilacak.
              </p>
            </>
          }
          trigger={
            <Button type="button" variant="destructive" size="sm" disabled={deletePending}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Hapus
            </Button>
          }
        />
      </div>

      {(deleteState.error || toggleState.error) && (
        <p className="max-w-md text-right text-xs text-destructive">
          {deleteState.error ?? toggleState.error}
        </p>
      )}
    </div>
  );
}

export function VoucherList({
  vouchers,
  categories,
  products,
  saveAction,
  deleteAction,
  toggleAction,
}: {
  vouchers: VoucherRow[];
  categories: { id: string; label: string }[];
  products: { id: string; label: string }[];
  saveAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  toggleAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const [editing, setEditing] = useState<VoucherFormValue | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kode Promo</h1>
          <p className="text-sm text-muted-foreground">
            Potongan harga yang ditukarkan pembeli dengan kode saat checkout.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(EMPTY_VOUCHER)}>
          <Plus className="size-4" aria-hidden="true" />
          Buat voucher
        </Button>
      </div>

      {vouchers.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Belum ada kode promo. Buat satu untuk mulai memberi potongan harga.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {vouchers.map((v) => {
            const habis = v.quota > 0 && v.usedCount >= v.quota;
            return (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{v.code}</span>
                    {!v.isActive && <Badge variant="muted">Nonaktif</Badge>}
                    {v.expired && <Badge variant="muted">Kedaluwarsa</Badge>}
                    {habis && <Badge variant="muted">Kuota habis</Badge>}
                    {v.allowFlashSale && <Badge variant="muted">Boleh flash sale</Badge>}
                    {!v.allowGuest && <Badge variant="muted">Member saja</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Potongan {ringkasPotongan(v)}
                    {" · "}
                    dipakai {v.usedCount}
                    {v.quota > 0 ? ` dari ${v.quota}` : " kali"}
                    {v.perTargetLimit > 0 && ` · maks ${v.perTargetLimit}× per tujuan`}
                  </p>
                  {v.description && <p className="truncate text-xs text-muted-foreground">{v.description}</p>}
                </div>

                <RowActions
                  voucher={v}
                  onEdit={() => setEditing(v)}
                  deleteAction={deleteAction}
                  toggleAction={toggleAction}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent
          title={editing?.id ? `Edit ${editing.code}` : "Buat voucher baru"}
          description="Potongan berlaku pada harga item setelah flash sale & diskon tier member."
        >
          {editing && (
            <VoucherForm
              // key memaksa form dibuat ulang saat berpindah voucher - tanpa
              // ini, membuka voucher kedua menampilkan isian voucher pertama
              // karena state-nya tidak pernah diinisialisasi ulang.
              key={editing.id || "baru"}
              initial={editing}
              categories={categories}
              products={products}
              action={saveAction}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
