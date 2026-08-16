import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ChangeEmailForm } from "@/components/change-email-form";
import { ChangeNameForm } from "@/components/change-name-form";
import { TwoFactorPanel } from "@/components/two-factor-panel";
import { getTwoFactorStatus } from "@/lib/auth/two-factor";
import { changeName, changePassword, requestEmailChangeAction } from "@/app/actions/account";
import {
  confirmTwoFactorSetup,
  disableTwoFactorAction,
  startTwoFactorSetup,
} from "@/app/actions/two-factor";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const twoFactor = await getTwoFactorStatus(session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-bold">Nama Tampilan</h2>
        <p className="text-sm text-muted-foreground">
          Nama yang muncul di akun dan struk pesananmu.
        </p>
        <div className="glass-card mt-3 rounded-2xl p-5">
          <ChangeNameForm action={changeName} idPrefix="akun" currentName={session.user.name ?? ""} />
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-bold">Ganti Email</h2>
        <p className="text-sm text-muted-foreground">
          Email ini dipakai untuk login dan menerima link pemulihan akun. Karena itu alamat barunya harus
          dikonfirmasi dulu lewat link yang kami kirim ke sana — sampai link itu diklik, email kamu tidak berubah.
        </p>
        <div className="glass-card mt-3 rounded-2xl p-5">
          <ChangeEmailForm
            action={requestEmailChangeAction}
            idPrefix="akun"
            currentEmail={session.user.email ?? ""}
          />
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-bold">Keamanan Login</h2>
        <p className="text-sm text-muted-foreground">
          Opsional, tapi disarankan kalau saldomu cukup besar untuk disayangkan.
        </p>
        <div className="mt-3">
          <TwoFactorPanel
            enabled={twoFactor.enabled}
            recoveryLeft={twoFactor.recoveryLeft}
            canDisable
            startSetup={startTwoFactorSetup}
            confirmSetup={confirmTwoFactorSetup}
            disableAction={disableTwoFactorAction}
          />
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
