import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // registerAction mengalihkan ke /login?registered=1 setelah pendaftaran
  // berhasil. Sebelumnya penanda ini di-set tapi tidak pernah ditampilkan,
  // jadi user selesai mendaftar tanpa konfirmasi apa pun.
  const justRegistered = (await searchParams).registered === "1";

  return (
    <AuthLayout
      title="Masuk"
      description="Selamat datang kembali. Masuk untuk bayar pakai saldo dan melihat riwayat pesanan."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Daftar sekarang
          </Link>
        </>
      }
    >
      <LoginForm justRegistered={justRegistered} />
    </AuthLayout>
  );
}
