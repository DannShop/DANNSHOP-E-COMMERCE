"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Daftar Member DannShop</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="name" required placeholder="Nama" className="rounded border p-2" />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="rounded border p-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password (min. 8 karakter)"
          className="rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {pending ? "Memproses..." : "Daftar"}
        </button>
      </form>
      <p className="text-sm">
        Sudah punya akun?{" "}
        <Link href="/login" className="underline">
          Masuk
        </Link>
      </p>
    </main>
  );
}
