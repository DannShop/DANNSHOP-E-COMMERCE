"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logoutAfterPasswordChange } from "@/app/actions/account";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

// Jeda singkat supaya pesan "berhasil" sempat kebaca sebelum diarahkan ke /login.
const LOGOUT_DELAY_MS = 1500;

export function ChangePasswordForm({
  action,
  idPrefix,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  /** Pembeda id input kalau ada lebih dari satu form di satu halaman. */
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );

  // Sesi lama otomatis basi begitu password berganti (User.updatedAt ikut naik
  // dan dibandingkan dengan yang tersimpan di JWT), jadi user harus dilogout -
  // kalau tidak, aksi berikutnya bakal ditolak tanpa penjelasan.
  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => {
      void logoutAfterPasswordChange();
    }, LOGOUT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-current-password`}>Password Saat Ini</Label>
        <Input
          id={`${idPrefix}-current-password`}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending || Boolean(state.ok)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-new-password`}>Password Baru</Label>
        <Input
          id={`${idPrefix}-new-password`}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending || Boolean(state.ok)}
        />
        <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-confirm-password`}>Ulangi Password Baru</Label>
        <Input
          id={`${idPrefix}-confirm-password`}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={pending || Boolean(state.ok)}
        />
      </div>

      <Button type="submit" disabled={pending || Boolean(state.ok)} className="self-start">
        {pending ? "Menyimpan..." : "Ganti Password"}
      </Button>

      {(state.ok || state.error) && (
        <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}
