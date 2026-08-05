import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { PaymentActions } from "@/lib/midtrans/client";

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
  const payment = order.payment?.actions as PaymentActions | null;

  return NextResponse.json(
    {
      orderNumber: order.orderNumber,
      status: order.status,
      productName: order.productName,
      itemName: order.itemName,
      sellingPrice: order.sellingPrice.toString(),
      fee: order.fee.toString(),
      uniqueCode: order.uniqueCode,
      total: order.total.toString(),
      payment,
      expiredAt: order.expiredAt,
      sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
