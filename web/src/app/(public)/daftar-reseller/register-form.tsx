"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthAlert, AuthField, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";
import { registerResellerPublic } from "@/app/actions/reseller";

type ActionResult = { ok?: string; error?: string };

export function ResellerRegisterForm() {
  const [state, formAction, pending] = useActionState(registerResellerPublic, undefined as ActionResult | undefined);

  // Jawaban sukses SELALU sama, apa pun yang terjadi di server - termasuk saat
  // emailnya ternyata sudah punya akun. Lihat PUBLIC_ACK di actions/reseller.ts:
  // membedakan jawabannya akan mengubah form ini jadi alat menguji email mana
  // yang terdaftar di toko.
  if (state?.ok) {
    return (
      <div className="rounded-xl border p-6">
        <AuthAlert variant="success">{state.ok}</AuthAlert>
        <p className="mt-4 text-sm text-muted-foreground">
          Belum menerima emailnya? Cek folder spam dulu. Kalau kamu memang sudah punya akun di sini,
          lanjutkan langsung dari{" "}
          <Link href="/account/reseller" className="font-medium text-primary underline-offset-4 hover:underline">
            menu Reseller
          </Link>{" "}
          di dalam akunmu.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border p-6">
      <AuthField label="Nama lengkap" name="name" autoComplete="name" required maxLength={60} />
      <AuthField label="Nama usaha" name="businessName" required maxLength={80} />
      <AuthField
        label="Nomor WhatsApp"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        maxLength={20}
        hint="Dipakai admin kalau ada yang perlu dikonfirmasi soal akunmu."
      />
      <AuthField label="Email" name="email" type="email" autoComplete="email" required />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        hint="Minimal 8 karakter."
      />
      <AuthField
        label="Kode referral"
        name="referralCode"
        maxLength={40}
        hint="Opsional. Kosongkan kalau tidak punya."
      />

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <AuthSubmit pending={pending} pendingLabel="Mendaftarkan...">
        Daftar Reseller
      </AuthSubmit>

      <p className="text-xs text-muted-foreground">
        Sudah punya akun? Daftar reseller langsung dari{" "}
        <Link href="/account/reseller" className="font-medium text-primary underline-offset-4 hover:underline">
          menu Reseller
        </Link>{" "}
        di akunmu — email dan passwordmu tidak perlu diisi ulang.
      </p>
    </form>
  );
}
