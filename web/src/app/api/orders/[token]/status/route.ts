import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { publicToken: token },
    include: {
      payment: true,
      fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 },
    },
  });
  if (!order) return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });

  const latestFulfillment = order.fulfillments[0];
  const actions = order.payment?.actions as { qrString?: string } | null;

  return NextResponse.json(
    {
      orderNumber: order.orderNumber,
      status: order.status,
      productName: order.productName,
      itemName: order.itemName,
      total: order.total.toString(),
      qrString: actions?.qrString ?? null,
      expiredAt: order.expiredAt,
      sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
