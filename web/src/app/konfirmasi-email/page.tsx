import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/auth-layout";
import { cn } from "@/lib/utils";
import { ConfirmEmailForm } from "./confirm-email-form";

export const metadata: Metadata = { title: "Konfirmasi Email Baru" };

// Halaman PUBLIK, dan itu disengaja. Link-nya dibuka dari inbox alamat BARU -
// sering di HP atau browser lain yang belum pernah login. Kalau halaman ini
// menuntut sesi, orang yang alamat barunya ada di perangkat lain tidak akan
// pernah bisa menyelesaikan perpindahannya. Tokenlah kredensialnya di sini.
//
// Server component tipis, meniru /reset-password: cuma mengambil token dari
// query (searchParams berupa Promise di versi Next ini). Keabsahan token tetap
// diuji di server action saat tombolnya ditekan.
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";

  if (!token) {
    return (
      <AuthLayout
        title="Link tidak valid"
        description="Link konfirmasi ini tidak valid atau sudah kedaluwarsa. Ajukan ganti email lagi dari halaman pengaturan akun."
      >
        <Link href="/login" className={cn(buttonVariants(), "h-11 w-full rounded-xl text-[0.9375rem]")}>
          Ke Halaman Masuk
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Konfirmasi email baru"
      description="Klik tombol di bawah untuk memindahkan akunmu ke alamat email ini. Setelah berhasil, kamu perlu login ulang memakai alamat yang baru."
      footer={
        <>
          Bukan kamu yang meminta ini?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Abaikan saja halaman ini
          </Link>
        </>
      }
    >
      <ConfirmEmailForm token={token} />
    </AuthLayout>
  );
}
