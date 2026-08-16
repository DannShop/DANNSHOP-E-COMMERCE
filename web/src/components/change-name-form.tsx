"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logoutAfterAccountChange } from "@/app/actions/account";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

// Jeda singkat supaya pesan "berhasil" sempat kebaca sebelum diarahkan ke /login.
const LOGOUT_DELAY_MS = 1500;

export function ChangeNameForm({
  action,
  idPrefix,
  currentName,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  /** Pembeda id input kalau ada lebih dari satu form di satu halaman. */
  idPrefix: string;
  currentName: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  // Sama seperti ganti password: menulis ke tabel User menaikkan updatedAt, yang
  // dibandingkan dengan JWT - sesi lama langsung basi dan harus ditutup rapi.
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => {
      void logoutAfterAccountChange();
    }, LOGOUT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-name`}>Nama Tampilan</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={currentName}
          minLength={2}
          maxLength={60}
          required
          disabled={pending || Boolean(state.ok)}
        />
        <p className="text-xs text-muted-foreground">
          2–60 karakter. Setelah disimpan kamu akan diminta login ulang.
        </p>
      </div>

      <Button type="submit" disabled={pending || Boolean(state.ok)} className="self-start">
        {pending ? "Menyimpan..." : "Simpan Nama"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
