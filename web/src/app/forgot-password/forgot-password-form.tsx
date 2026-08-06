"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { AuthAlert, AuthField, AuthSubmit } from "@/components/auth/auth-fields";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  // Sudah terkirim: form disembunyikan supaya user tidak menekan kirim
  // berulang kali dan kena rate limit tanpa tahu sebabnya.
  if (state?.ok) {
    return <AuthAlert variant="success">{state.ok}</AuthAlert>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nama@email.com"
        required
      />

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <AuthSubmit pending={pending} pendingLabel="Mengirim...">
        Kirim Link Reset
      </AuthSubmit>
    </form>
  );
}
