"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";
import { AuthAlert, AuthField, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthField
        label="Nama"
        name="name"
        autoComplete="name"
        placeholder="Nama kamu"
        required
      />

      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nama@email.com"
        required
      />

      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="Minimal 8 karakter."
      />

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <AuthSubmit pending={pending} pendingLabel="Memproses...">
        Buat Akun
      </AuthSubmit>
    </form>
  );
}
