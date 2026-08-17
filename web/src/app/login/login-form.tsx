"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { AuthAlert, AuthField, AuthSubmit, PasswordField } from "@/components/auth/auth-fields";

export function LoginForm({ justRegistered }: { justRegistered: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  // Email & password DIKENDALIKAN state, bukan dibiarkan tak-terkendali.
  //
  // INI BUKAN SELERA — tanpa ini, login dua langkah mustahil diselesaikan sama
  // sekali. React 19 me-reset form tak-terkendali secara otomatis setiap kali
  // sebuah form action selesai, jadi jawaban "lanjut, minta kode" dari server
  // ikut mengosongkan kedua kolom ini. Submit kedua lalu berangkat membawa kode
  // yang benar tapi tanpa identitas, dan server menolaknya.
  //
  // Yang membuat bug ini mahal adalah penyamarannya: di langkah kedua,
  // loginAction melaporkan SEMUA kegagalan sebagai "Kode autentikasi salah",
  // sehingga gejalanya menuduh kode autentikator maupun kode pemulihan -
  // padahal keduanya tidak pernah sempat diperiksa. Sudah terjadi di produksi
  // dan mengunci seluruh akun ber-2FA, termasuk semua admin.
  //
  // Menahan elemennya tetap terpasang di DOM (yang sudah dilakukan di bawah)
  // TIDAK cukup: yang dikosongkan React nilainya, bukan elemennya.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Langkah kedua ditentukan SEPENUHNYA oleh jawaban server, bukan oleh state
  // lokal. Kalau form yang memutuskan sendiri kapan pindah langkah, dia harus
  // ikut menebak apakah akunnya memakai 2FA - tebakan yang cuma bisa dijawab
  // server, dan salah tebaknya berujung layar yang menuntut kode dari orang
  // yang tidak punya autentikator.
  const step2 = state?.needsTotp === true;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {justRegistered && !state?.error && !step2 && (
        <AuthAlert variant="success">Akun berhasil dibuat. Silakan masuk.</AuthAlert>
      )}

      {/* Email & password TETAP TERPASANG di langkah kedua, cuma disembunyikan.
          Server memverifikasi ulang keduanya bersama kodenya - satu-satunya
          submit yang benar-benar menerbitkan sesi - jadi nilainya harus ikut
          terkirim. Melepasnya dari DOM akan membuat langkah kedua mengirim form
          tanpa password dan selalu gagal.

          Terpasang saja tidak cukup: nilainya juga wajib dikendalikan state -
          lihat catatan panjang di atas soal reset otomatis React 19. */}
      <div className={step2 ? "hidden" : "flex flex-col gap-4"}>
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nama@email.com"
          required
          readOnly={step2}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          readOnly={step2}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          action={
            <Link
              href="/forgot-password"
              className="text-[0.8125rem] text-primary transition-opacity hover:opacity-70"
            >
              Lupa password?
            </Link>
          }
        />
      </div>

      {step2 && (
        <>
          <AuthAlert variant="success">
            Password benar. Masukkan kode dari aplikasi autentikatormu untuk menyelesaikan login.
          </AuthAlert>
          <AuthField
            label="Kode autentikasi"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            hint="Enam angka dari aplikasi autentikator, atau salah satu kode pemulihanmu."
            required
            autoFocus
          />
        </>
      )}

      {state?.error && <AuthAlert variant="error">{state.error}</AuthAlert>}

      <AuthSubmit pending={pending} pendingLabel="Memproses...">
        {step2 ? "Verifikasi & Masuk" : "Masuk"}
      </AuthSubmit>
    </form>
  );
}
