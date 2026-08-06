"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { AuthAlert, AuthField, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";

export function LoginForm({ justRegistered }: { justRegistered: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Sembunyikan begitu ada error: pesan "akun berhasil dibuat" di sebelah
          "email atau password salah" cuma bikin bingung. */}
      {justRegistered && !state?.error && (
        <AuthAlert variant="success">Akun berhasil dibuat. Silakan masuk.</AuthAlert>
      )}

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
        autoComplete="current-password"
        required
        action={
          <Link
            href="/forgot-password"
            className="text-[0.8125rem] text-primary transition-opacity hover:opacity-70"
          >
            Lupa password?
          </Link>
        }
      />

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <AuthSubmit pending={pending} pendingLabel="Memproses...">
        Masuk
      </AuthSubmit>
    </form>
  );
}
