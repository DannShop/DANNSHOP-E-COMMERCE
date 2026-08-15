"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function CategoryForm({
  category,
  updateAction,
  deleteAction,
  autoMargin,
}: {
  category: { id: string; slug: string; name: string; sortOrder: number; productCount: number };
  updateAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  /** Form margin otomatis, dirakit di Server Component supaya action-nya bisa dioper. */
  autoMargin?: React.ReactNode;
}) {
  const [updateState, updateFormAction, updatePending] = useActionState(
    (_prev: ActionResult, formData: FormData) => updateAction(formData),
    INITIAL_STATE,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    (_prev: ActionResult, formData: FormData) => deleteAction(formData),
    INITIAL_STATE,
  );

  return (
    <div className="rounded-lg border p-3">
      <form action={updateFormAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
        <input type="hidden" name="id" value={category.id} />
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">/{category.slug}</Label>
          <Input name="name" defaultValue={category.name} required />
        </div>
        <div>
          <Label htmlFor={`sortOrder-${category.id}`} className="text-xs">Urutan</Label>
          <Input id={`sortOrder-${category.id}`} name="sortOrder" type="number" defaultValue={category.sortOrder} />
        </div>
        <div className="text-xs text-muted-foreground">{category.productCount} produk</div>
        <Button type="submit" size="sm" disabled={updatePending} className="ml-auto">
          {updatePending ? "..." : "Simpan"}
        </Button>
      </form>

      {autoMargin}

      <form id={`delete-category-${category.id}`} action={deleteFormAction} className="mt-2">
        <input type="hidden" name="id" value={category.id} />
        <ConfirmSubmit
          formId={`delete-category-${category.id}`}
          title={`Hapus kategori "${category.name}"?`}
          confirmLabel="Hapus kategori"
          trigger={
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deletePending || category.productCount > 0}
              title={category.productCount > 0 ? "Kategori masih punya produk, tidak bisa dihapus" : undefined}
            >
              {deletePending ? "..." : "Hapus"}
            </Button>
          }
          description={<p>Kategori ini hilang dari navigasi storefront. Tidak bisa dibatalkan.</p>}
        />
      </form>

      {(updateState.ok || updateState.error) && (
        <p className={`mt-1 text-xs ${updateState.error ? "text-destructive" : "text-emerald-700"}`}>
          {updateState.error ?? updateState.ok}
        </p>
      )}
      {(deleteState.ok || deleteState.error) && (
        <p className={`mt-1 text-xs ${deleteState.error ? "text-destructive" : "text-emerald-700"}`}>
          {deleteState.error ?? deleteState.ok}
        </p>
      )}
    </div>
  );
}
