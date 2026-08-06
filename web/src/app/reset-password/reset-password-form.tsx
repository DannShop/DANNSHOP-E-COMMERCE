"use client";

import { useActionState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { resetPasswordAction } from "@/app/actions/auth";
import { AuthAlert, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";
import { cn } from "@/lib/utils";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  // Sudah sukses: tidak perlu form lagi, token-nya juga sudah hangus (sekali pakai).
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <AuthAlert variant="success">{state.ok}</AuthAlert>
        <Link href="/login" className={cn(buttonVariants(), "h-11 w-full rounded-xl text-[0.9375rem]")}>
          Masuk Sekarang
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <PasswordField
        label="Password Baru"
        name="newPassword"
        autoComplete="new-password"
        minLength={8}
        required
        hint="Minimal 8 karakter."
      />

      <PasswordField
        label="Ulangi Password Baru"
        name="confirmPassword"
        autoComplete="new-password"
        minLength={8}
        required
      />

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <AuthSubmit pending={pending} pendingLabel="Menyimpan...">
        Simpan Password Baru
      </AuthSubmit>
    </form>
  );
}
