import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTwoFactorStatus } from "@/lib/auth/two-factor";
import { TwoFactorPanel } from "@/components/two-factor-panel";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ChangeEmailForm } from "@/components/change-email-form";
import { ChangeNameForm } from "@/components/change-name-form";
import { changeName, changePassword, requestEmailChangeAction } from "@/app/actions/account";
import {
  confirmTwoFactorSetup,
  disableTwoFactorAction,
  startTwoFactorSetup,
} from "@/app/actions/two-factor";

export const metadata: Metadata = { title: "Keamanan Akun" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-heading text-base font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Semua form di halaman ini memakai server action yang SAMA dengan milik user di
// /account/settings. Bukan kebetulan: admin dan user adalah baris di tabel User
// yang sama, jadi menduplikasi aksinya cuma akan melahirkan dua jalur kredensial
// yang harus dijaga tetap sinkron - dan yang satu pasti ketinggalan saat
// aturannya berubah. Yang berbeda cuma tata letak dan `idPrefix`-nya.
export default async function AdminSecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const status = await getTwoFactorStatus(session.user.id);

  return (
    <div className="max-w-2xl space-y-8">
      <p className="text-sm text-muted-foreground">
        Akun admin memegang kunci pembayaran, kredensial provider, dan seluruh data order. Satu password yang bocor
        tanpa faktor kedua sudah cukup untuk semuanya — karena itu 2FA di sini wajib.
      </p>

      <TwoFactorPanel
        enabled={status.enabled}
        recoveryLeft={status.recoveryLeft}
        canDisable={false}
        startSetup={startTwoFactorSetup}
        confirmSetup={confirmTwoFactorSetup}
        disableAction={disableTwoFactorAction}
      />

      <Section
        title="Ganti Password"
        description="Setelah password berhasil diganti, kamu otomatis dilogout dan harus login ulang."
      >
        <div className="glass-card rounded-2xl p-5">
          <ChangePasswordForm action={changePassword} idPrefix="admin" />
        </div>
      </Section>

      <Section
        title="Ganti Email"
        description="Email ini dipakai untuk login dan menerima link pemulihan akun. Alamat barunya harus dikonfirmasi lewat link yang kami kirim ke sana — sampai link itu diklik, email kamu tidak berubah. Alamat lama juga ikut dikabari, supaya perpindahan yang bukan kamu yang minta tetap ketahuan."
      >
        <div className="glass-card rounded-2xl p-5">
          <ChangeEmailForm
            action={requestEmailChangeAction}
            idPrefix="admin"
            currentEmail={session.user.email ?? ""}
          />
        </div>
      </Section>

      <Section title="Nama Tampilan" description="Nama yang muncul di panel dan catatan aktivitas admin.">
        <div className="glass-card rounded-2xl p-5">
          <ChangeNameForm action={changeName} idPrefix="admin" currentName={session.user.name ?? ""} />
        </div>
      </Section>
    </div>
  );
}
