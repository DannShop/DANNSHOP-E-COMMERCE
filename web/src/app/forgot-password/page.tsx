import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Lupa Password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Lupa password"
      description="Masukkan email akunmu. Kami kirim link untuk membuat password baru."
      footer={
        <>
          Ingat passwordmu?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Kembali ke halaman masuk
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
