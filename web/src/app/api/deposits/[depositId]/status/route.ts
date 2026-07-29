import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ depositId: string }> }) {
  const { depositId } = await params;
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) return NextResponse.json({ error: "Deposit tidak ditemukan" }, { status: 404 });

  const rawResponse = deposit.rawResponse as { qrString?: string } | null;

  return NextResponse.json({
    depositId: deposit.id,
    status: deposit.status,
    amount: deposit.amount.toString(),
    qrString: rawResponse?.qrString ?? null,
    expiredAt: deposit.expiredAt,
  });
}
