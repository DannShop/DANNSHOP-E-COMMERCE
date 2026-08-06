"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Lupa Password</h1>
      <p className="text-sm text-gray-600">
        Masukkan email akun Anda. Kami akan mengirim link untuk membuat password baru.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {pending ? "Mengirim..." : "Kirim Link Reset"}
        </button>
      </form>
      <p className="text-sm">
        Ingat password Anda?{" "}
        <Link href="/login" className="underline">
          Masuk
        </Link>
      </p>
    </main>
  );
}
