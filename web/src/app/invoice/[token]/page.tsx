import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import type { PaymentActions } from "@/lib/midtrans/client";
import { getSnapBrowserConfig } from "@/lib/payment/gateway-config";
import { getInvoiceBranding } from "@/lib/invoice/branding";
import { getManualOrderSettings } from "@/lib/invoice/manual-order";
import { renderPlainTemplate } from "@/lib/notify/template";
import { describeOrderTarget } from "@/lib/order/customer-no";
import { ManualOrderConfirm } from "@/components/payment/manual-order-confirm";
import { InvoiceStatus } from "./invoice-status";
import { StorefrontSlot } from "@/components/storefront-slot";

export const dynamic = "force-dynamic";

// Status di mana produk manual sudah dibayar tapi belum tuntas - hanya di
// rentang inilah tombol konfirmasi ke admin masuk akal. Sebelum dibayar tidak
// ada yang perlu dikonfirmasi, dan sesudah COMPLETED pesanannya sudah selesai.
const MANUAL_AWAITING_STATUSES = new Set(["PAID", "PROCESSING", "NEEDS_REVIEW"]);

function formatRupiah(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

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

  const showManualConfirm = order.fulfillmentMode === "MANUAL" && MANUAL_AWAITING_STATUSES.has(order.status);
  // Dua query pengaturan ini hanya dibayar oleh order manual yang memang
  // membutuhkannya - order otomatis (mayoritas mutlak) tidak ikut kena.
  const manual = showManualConfirm
    ? await (async () => {
        const [settings, branding] = await Promise.all([getManualOrderSettings(), getInvoiceBranding()]);
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
        const message = renderPlainTemplate(settings.messageTemplate, {
          brand_name: branding.brandName,
          order_number: order.orderNumber,
          product_name: order.productName,
          item_name: order.itemName,
          target: describeOrderTarget(order.target),
          total: formatRupiah(order.total),
          buyer_email: order.buyerEmail ?? "-",
          invoice_url: `${baseUrl}/invoice/${order.publicToken}`,
        });
        const wantsWa = settings.channel === "whatsapp" || settings.channel === "both";
        const wantsTg = settings.channel === "telegram" || settings.channel === "both";
        return {
          note: settings.invoiceNote,
          message,
          whatsappUrl:
            wantsWa && settings.whatsappNumber
              ? `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(message)}`
              : null,
          // t.me tidak menerima parameter teks untuk chat pribadi - link ini
          // hanya membuka percakapannya. Itu sebabnya tombol "salin pesan" di
          // komponennya selalu ada, bukan cuma pelengkap.
          telegramUrl: wantsTg && settings.telegramUsername ? `https://t.me/${settings.telegramUsername}` : null,
        };
      })()
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-10">
      <Link href="/" className="font-heading text-sm font-bold text-primary hover:underline">
        ← DannShop
      </Link>
      <StorefrontSlot name="invoice_top" />
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
          discount: order.discount.toString(),
          voucherCode: order.voucherCode,
          fee: order.fee.toString(),
          uniqueCode: order.uniqueCode,
          total: order.total.toString(),
          payment: actions,
          expiredAt: order.expiredAt?.toISOString() ?? null,
          sn: latestFulfillment?.status === "SUCCESS" ? latestFulfillment.sn : order.manualSn,
        }}
        hideShareButton={manual !== null}
      />

      {manual && (
        <ManualOrderConfirm
          note={manual.note}
          message={manual.message}
          whatsappUrl={manual.whatsappUrl}
          telegramUrl={manual.telegramUrl}
        />
      )}

      {/* Struk hanya berguna setelah ada yang dibayar - menawarkannya pada
          pesanan yang belum dibayar cuma menghasilkan kertas berisi tagihan. */}
      {order.status !== "PENDING_PAYMENT" && (
        <Link
          href={`/invoice/${order.publicToken}/struk`}
          className="flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          <Printer className="size-4" aria-hidden="true" />
          Cetak Struk
        </Link>
      )}
      <StorefrontSlot name="invoice_bottom" />
    </div>
  );
}
