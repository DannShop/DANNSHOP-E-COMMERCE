import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Daftar" };

export default function RegisterPage() {
  return (
    <AuthLayout
      title="Buat akun"
      description="Gratis. Dapat harga member, saldo, dan riwayat pesanan yang tersimpan rapi."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Masuk
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
