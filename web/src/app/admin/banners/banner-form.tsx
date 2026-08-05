"use client";

import { useActionState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function BannerForm({
  banner,
  updateAction,
  deleteAction,
}: {
  banner: { id: string; imageUrl: string; linkUrl: string | null; sortOrder: number; isActive: boolean };
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
    <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row">
      <div className="relative aspect-21/9 w-full shrink-0 overflow-hidden rounded-md border sm:w-48">
        <Image src={banner.imageUrl} alt="" fill sizes="192px" className="object-cover" unoptimized />
      </div>

      <div className="flex-1 space-y-2">
        <form action={updateFormAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
          <input type="hidden" name="id" value={banner.id} />
          <div className="col-span-2">
            <Label htmlFor={`linkUrl-${banner.id}`} className="text-xs">Link Tujuan</Label>
            <Input id={`linkUrl-${banner.id}`} name="linkUrl" defaultValue={banner.linkUrl ?? ""} placeholder="https://..." />
          </div>
          <div>
            <Label htmlFor={`sortOrder-${banner.id}`} className="text-xs">Urutan</Label>
            <Input id={`sortOrder-${banner.id}`} name="sortOrder" type="number" defaultValue={banner.sortOrder} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox name="isActive" defaultChecked={banner.isActive} />
            <span className="text-sm">Aktif</span>
          </div>
          <Button type="submit" size="sm" disabled={updatePending} className="col-span-full sm:col-span-1">
            {updatePending ? "..." : "Simpan"}
          </Button>
        </form>

        <form
          action={deleteFormAction}
          onSubmit={(e) => {
            if (!window.confirm("Hapus banner ini? Aksi ini tidak bisa dibatalkan.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={banner.id} />
          <Button type="submit" size="sm" variant="outline" disabled={deletePending}>
            {deletePending ? "..." : "Hapus"}
          </Button>
        </form>

        {(updateState.ok || updateState.error) && (
          <p className={`text-xs ${updateState.error ? "text-destructive" : "text-emerald-700"}`}>
            {updateState.error ?? updateState.ok}
          </p>
        )}
        {(deleteState.ok || deleteState.error) && (
          <p className={`text-xs ${deleteState.error ? "text-destructive" : "text-emerald-700"}`}>
            {deleteState.error ?? deleteState.ok}
          </p>
        )}
      </div>
    </div>
  );
}
