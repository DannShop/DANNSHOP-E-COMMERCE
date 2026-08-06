import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/auth-layout";
import { cn } from "@/lib/utils";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Buat Password Baru" };

// Server component tipis: cuma ambil token dari query (searchParams berupa Promise di
// versi Next ini), validasi token asli tetap dilakukan di server action saat submit.
export default async function ResetPasswordPage({
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
        description="Link reset password ini tidak valid atau sudah kedaluwarsa. Silakan minta link yang baru."
      >
        <Link
          href="/forgot-password"
          className={cn(buttonVariants(), "h-11 w-full rounded-xl text-[0.9375rem]")}
        >
          Minta Link Baru
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Buat password baru"
      description="Pilih password baru untuk akunmu. Setelah tersimpan, kamu bisa langsung masuk."
      footer={
        <>
          Link sudah kedaluwarsa?{" "}
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Minta link baru
          </Link>
        </>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthLayout>
  );
}
