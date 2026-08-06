"use client";

import { useActionState, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export function MaintenanceModeForm({
  initial,
  action,
}: {
  initial: { maintenanceMode: boolean; maintenanceMessage: string };
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [enabled, setEnabled] = useState(initial.maintenanceMode);
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {enabled && (
        <div className="flex items-center gap-1.5 rounded-md border-2 border-destructive bg-destructive/20 px-2 py-1.5 text-xs font-bold text-destructive">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          Maintenance mode AKTIF — storefront publik tertutup untuk semua pengunjung.
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="maintenanceMode" checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
        Aktifkan maintenance mode
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="maintenance-message" className="text-xs">
          Pesan yang tampil ke pengunjung
        </Label>
        <textarea
          id="maintenance-message"
          name="maintenanceMessage"
          defaultValue={initial.maintenanceMessage}
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Halaman admin (termasuk halaman ini) tetap bisa diakses selagi maintenance mode aktif — cuma storefront
        publik (beranda, halaman produk, checkout, dll.) yang ditutup.
      </p>

      <Button type="submit" disabled={pending} variant={enabled ? "destructive" : "default"} className="self-start">
        {pending ? "Menyimpan..." : enabled ? "Aktifkan Maintenance Mode" : "Simpan"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
