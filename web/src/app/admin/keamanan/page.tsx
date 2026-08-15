import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTwoFactorStatus } from "@/lib/auth/two-factor";
import { TwoFactorPanel } from "@/components/two-factor-panel";
import {
  confirmTwoFactorSetup,
  disableTwoFactorAction,
  startTwoFactorSetup,
} from "@/app/actions/two-factor";

export const metadata: Metadata = { title: "Keamanan Akun" };

export default async function AdminSecurityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const status = await getTwoFactorStatus(session.user.id);

  return (
    <div className="max-w-2xl space-y-6">
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
    </div>
  );
}
