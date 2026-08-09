import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "./register-form";
import { StorefrontSlot } from "@/components/storefront-slot";

export const metadata: Metadata = { title: "Daftar" };

// Halaman ini membaca slot HTML kustom admin (lihat StorefrontSlot di bawah),
// jadi tidak boleh ikut di-prerender statis saat build - kalau statis, isinya
// dibekukan pada nilai yang kebetulan ada di DB saat build dan perubahan admin
// tidak akan pernah muncul sampai deploy berikutnya.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  return (
    <AuthLayout
      title="Buat akun"
      description="Gratis. Punya saldo, riwayat pesanan tersimpan rapi, dan bisa upgrade ke tier member untuk diskon & benefit tambahan."
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
      <StorefrontSlot name="register_note" className="mt-4 text-sm text-muted-foreground" />
    </AuthLayout>
  );
}
