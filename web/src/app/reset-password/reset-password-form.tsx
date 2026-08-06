"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, undefined);

  // Sudah sukses: tidak perlu form lagi, token-nya juga sudah hangus (sekali pakai).
  if (state?.ok) {
    return (
      <>
        <p className="text-sm text-green-700">{state.ok}</p>
        <Link href="/login" className="rounded bg-black p-2 text-center text-white">
          Masuk Sekarang
        </Link>
      </>
    );
  }

  return (
    <>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          placeholder="Password baru"
          className="rounded border p-2"
        />
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          placeholder="Ulangi password baru"
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {pending ? "Menyimpan..." : "Simpan Password Baru"}
        </button>
      </form>
      <p className="text-sm">
        Link sudah kedaluwarsa?{" "}
        <Link href="/forgot-password" className="underline">
          Minta link baru
        </Link>
      </p>
    </>
  );
}
