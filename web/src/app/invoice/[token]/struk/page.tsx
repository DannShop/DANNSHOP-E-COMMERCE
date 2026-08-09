import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getInvoiceBranding } from "@/lib/invoice/branding";
import { buildReceiptText, type ReceiptData } from "@/lib/invoice/receipt-text";
import { describeOrderTarget } from "@/lib/order/customer-no";
import { ORDER_STATUS_LABEL } from "@/lib/order/status-labels";
import { ReceiptView } from "./receipt-view";
import { StorefrontSlot } from "@/components/storefront-slot";

export const dynamic = "force-dynamic";

// Struk dibangun di SERVER, bukan di browser.
//
// Teks 58/80 kolom dirakit sekali di sini untuk kedua ukuran lalu dikirim jadi
// ke klien, supaya perataan kolomnya identik antara yang dilihat di layar, yang
// keluar dari printer, dan yang dikirim ke aplikasi pencetak Bluetooth. Kalau
// dirakit di klien, satu perbedaan pembulatan saja sudah cukup membuat kolom
// nominal pada struk cetak bergeser dari yang tampil di layar.

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const order = await db.order.findUnique({
    where: { publicToken: token },
    include: { payment: true, fulfillments: { orderBy: { attemptNo: "desc" }, take: 1 } },
  });
  if (!order) notFound();

  const branding = await getInvoiceBranding();
  const latest = order.fulfillments[0];
  const sn = latest?.status === "SUCCESS" ? latest.sn : order.manualSn;
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const invoiceUrl = `${baseUrl}/invoice/${order.publicToken}`;

  const data: ReceiptData = {
    brandName: branding.brandName,
    tagline: branding.tagline,
    addressLines: branding.addressLine.split("\n").filter((l) => l.trim() !== ""),
    supportLines: branding.supportLine.split("\n").filter((l) => l.trim() !== ""),
    footerText: branding.footerText,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    statusLabel: ORDER_STATUS_LABEL[order.status] ?? order.status,
    productName: order.productName,
    itemName: order.itemName,
    target: describeOrderTarget(order.target),
    paymentMethod: order.paymentMethod ?? "",
    sellingPrice: order.sellingPrice,
    fee: order.fee,
    uniqueCode: order.uniqueCode,
    total: order.total,
    sn: sn ?? null,
    invoiceUrl,
  };

  const qrDataUri = branding.showQrOnReceipt
    ? await QRCode.toDataURL(invoiceUrl, { width: 160, margin: 0 })
    : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/invoice/${order.publicToken}`} className="text-sm text-primary hover:underline">
          ← Kembali ke invoice
        </Link>
        <span className="text-xs text-muted-foreground">{order.orderNumber}</span>
      </div>

      {/* print:hidden - catatan ini untuk layar, bukan untuk ikut tercetak
          di kertas struk yang lebarnya cuma 58 mm. */}
      <StorefrontSlot name="receipt_note" className="rounded-lg border p-3 text-sm print:hidden" />

      <ReceiptView
        brandName={branding.brandName}
        accentColor={branding.accentColor}
        logoUrl={branding.logoUrl}
        defaultPaper={branding.defaultPaperSize}
        qrDataUri={qrDataUri}
        text58={buildReceiptText(data, "58")}
        text80={buildReceiptText(data, "80")}
        a4={{
          tagline: branding.tagline,
          addressLines: data.addressLines,
          supportLines: data.supportLines,
          footerText: branding.footerText,
          orderNumber: data.orderNumber,
          createdAt: data.createdAt.toISOString(),
          statusLabel: data.statusLabel,
          productName: data.productName,
          itemName: data.itemName,
          target: data.target,
          paymentMethod: data.paymentMethod,
          sellingPrice: data.sellingPrice.toString(),
          fee: data.fee.toString(),
          uniqueCode: data.uniqueCode,
          total: data.total.toString(),
          sn: data.sn,
          invoiceUrl: data.invoiceUrl,
        }}
      />
    </div>
  );
}
