import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import type { PaymentActions } from "@/lib/midtrans/client";
import { getSnapBrowserConfig } from "@/lib/payment/gateway-config";
import { InvoiceStatus } from "./invoice-status";

export const dynamic = "force-dynamic";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { publicToken: token },
    include: { payment: true, fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 } },
  });
  if (!order) notFound();

  const actions = order.payment?.actions as PaymentActions | null;
  const latestFulfillment = order.fulfillments[0];
  const qrDataUri =
    actions?.kind === "qris" && actions.qrString
      ? await QRCode.toDataURL(actions.qrString, { width: 240, margin: 1 })
      : null;
  // Dibaca hanya saat pembayarannya memang mode Snap - order Core API tidak
  // perlu kena satu query konfigurasi tambahan di tiap kali invoice dibuka.
  const snapConfig = actions?.kind === "snap" ? await getSnapBrowserConfig() : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/" className="font-heading text-sm font-bold text-primary hover:underline">
        ← DannShop
      </Link>
      <InvoiceStatus
        token={order.publicToken}
        qrDataUri={qrDataUri}
        snapConfig={snapConfig}
        initial={{
          orderNumber: order.orderNumber,
          status: order.status,
          productName: order.productName,
          itemName: order.itemName,
          sellingPrice: order.sellingPrice.toString(),
          fee: order.fee.toString(),
          uniqueCode: order.uniqueCode,
          total: order.total.toString(),
          payment: actions,
          expiredAt: order.expiredAt?.toISOString() ?? null,
          sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
        }}
      />
    </div>
  );
}
