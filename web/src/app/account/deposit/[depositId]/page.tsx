import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { DepositStatus } from "./deposit-status";

export default async function DepositStatusPage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) notFound();

  const rawResponse = deposit.rawResponse as { qrString?: string } | null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/account" className="font-heading text-sm font-bold text-primary hover:underline">
        ← Akun Saya
      </Link>
      <DepositStatus
        depositId={deposit.id}
        initial={{
          depositId: deposit.id,
          status: deposit.status,
          amount: deposit.amount.toString(),
          qrString: rawResponse?.qrString ?? null,
          expiredAt: deposit.expiredAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
