import Link from "next/link";
import { ResetPasswordForm } from "./reset-password-form";

// Server component tipis: cuma ambil token dari query (searchParams berupa Promise di
// versi Next ini), validasi token asli tetap dilakukan di server action saat submit.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Buat Password Baru</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <>
          <p className="text-sm text-red-600">
            Link reset password tidak valid atau sudah kedaluwarsa. Silakan minta link baru.
          </p>
          <Link href="/forgot-password" className="rounded bg-black p-2 text-center text-white">
            Minta Link Baru
          </Link>
        </>
      )}
    </main>
  );
}
