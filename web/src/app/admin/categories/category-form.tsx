"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function CategoryForm({
  category,
  updateAction,
  deleteAction,
}: {
  category: { id: string; slug: string; name: string; sortOrder: number; productCount: number };
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

      <form
        action={deleteFormAction}
        onSubmit={(e) => {
          if (!window.confirm(`Hapus kategori "${category.name}"? Aksi ini tidak bisa dibatalkan.`)) {
            e.preventDefault();
          }
        }}
        className="mt-2"
      >
        <input type="hidden" name="id" value={category.id} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={deletePending || category.productCount > 0}
          title={category.productCount > 0 ? "Kategori masih punya produk, tidak bisa dihapus" : undefined}
        >
          {deletePending ? "..." : "Hapus"}
        </Button>
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
