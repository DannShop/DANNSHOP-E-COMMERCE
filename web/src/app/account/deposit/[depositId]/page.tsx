import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DepositStatus } from "./deposit-status";

export default async function DepositStatusPage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.userId !== session.user.id) notFound();

  const rawResponse = deposit.rawResponse as { qrString?: string; snapToken?: string } | null;
  const qrDataUri = rawResponse?.qrString ? await QRCode.toDataURL(rawResponse.qrString, { width: 240, margin: 1 }) : null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <DepositStatus
        depositId={deposit.id}
        qrDataUri={qrDataUri}
        initial={{
          depositId: deposit.id,
          status: deposit.status,
          amount: deposit.amount.toString(),
          qrString: rawResponse?.qrString ?? null,
          snapToken: rawResponse?.snapToken ?? null,
          expiredAt: deposit.expiredAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
