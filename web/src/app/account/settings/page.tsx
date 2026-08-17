import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Handshake, Store } from "lucide-react";
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

/** Kartu tautan program. Bentuknya menyamai kartu di halaman Akun Saya. */
function ProgramLink({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-5 py-4 transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
    >
      <span className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{desc}</span>
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const twoFactor = await getTwoFactorStatus(session.user.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {/* ===== Program kemitraan =====
          Ditaruh di sini karena di HP keduanya TIDAK punya tab sendiri: dibuka
          sekali saat mendaftar lalu nyaris tidak pernah lagi, jadi tidak
          sebanding dengan biaya tetap satu tab permanen. Di sidebar desktop
          keduanya tetap tampil sebagai menu. Ini SATU-SATUNYA pintu masuknya di
          mobile — menghapus blok ini membuat kedua program itu tidak bisa
          ditemukan sama sekali dari HP. */}
      <section className="flex flex-col gap-1 md:hidden">
        <h2 className="font-heading text-base font-bold">Program</h2>
        <p className="text-sm text-muted-foreground">
          Harga khusus untuk yang berjualan ulang atau punya sistem sendiri.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <ProgramLink
            href="/account/reseller"
            icon={Store}
            title="Reseller"
            desc="Harga lebih murah untuk yang jualan eceran."
          />
          <ProgramLink
            href="/account/mitra"
            icon={Handshake}
            title="Mitra H2H"
            desc="Sambungkan sistemmu sendiri lewat API."
          />
        </div>
      </section>

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
