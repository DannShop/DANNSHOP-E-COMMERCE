import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { changePassword } from "@/app/actions/account";

export const metadata: Metadata = { title: "Pengaturan" };

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-bold">Profil</h2>
        <p className="text-sm text-muted-foreground">
          Nama dan email belum bisa diubah sendiri. Hubungi CS kalau perlu diperbarui.
        </p>
        <div className="glass-card mt-3 rounded-2xl px-5 py-1">
          <ProfileRow label="Nama" value={session.user.name ?? "—"} />
          <ProfileRow label="Email" value={session.user.email ?? "—"} />
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-bold">Ganti Password</h2>
        <p className="text-sm text-muted-foreground">
          Setelah password berhasil diganti, kamu otomatis dilogout dan harus login ulang.
        </p>
        <div className="glass-card mt-3 rounded-2xl p-5">
          <ChangePasswordForm action={changePassword} idPrefix="akun" />
        </div>
      </section>
    </div>
  );
}
