import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ depositId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Harus login untuk mengakses deposit" }, { status: 401 });

  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit || deposit.userId !== session.user.id) return NextResponse.json({ error: "Deposit tidak ditemukan" }, { status: 404 });

  const rawResponse = deposit.rawResponse as { qrString?: string } | null;

  return NextResponse.json(
    {
      depositId: deposit.id,
      status: deposit.status,
      amount: deposit.amount.toString(),
      qrString: rawResponse?.qrString ?? null,
      expiredAt: deposit.expiredAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
