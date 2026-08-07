import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { PaymentActions } from "@/lib/midtrans/client";
import { maybeReconcileOrder } from "@/lib/payment/reconcile";

export const dynamic = "force-dynamic";

const INCLUDE = {
  payment: true,
  fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let order = await db.order.findUnique({ where: { publicToken: token }, include: INCLUDE });
  if (!order) return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });

  // Jaring pengaman kalau webhook Midtrans tidak sampai - throttle 20 detik ada
  // di dalam maybeReconcileOrder, jadi polling 3 detik tidak membanjiri Midtrans.
  // Kalau reconcile jalan, order dibaca ulang karena statusnya mungkin berubah.
  if (await maybeReconcileOrder(order)) {
    order = (await db.order.findUnique({ where: { publicToken: token }, include: INCLUDE })) ?? order;
  }

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
