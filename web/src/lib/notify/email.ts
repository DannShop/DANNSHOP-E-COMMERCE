import { Resend } from "resend";
import type { PaymentActions } from "@/lib/midtrans/client";

// Pola sama persis dengan sendTelegramAlert (lib/notify/telegram.ts): tidak pernah
// throw, guard clause kalau env kosong, return boolean supaya caller bisa tahu
// status kirim tapi tidak wajib dicek. Kegagalan kirim email TIDAK BOLEH pernah
// menggagalkan pembayaran/fulfillment - semua pemanggilan di checkout.ts/
// fulfillment.ts/orders.ts dibungkus try/catch di dalam sini, bukan di caller.
// Beda dengan sendTelegramAlert Fase 7b (yang deliverable-nya notifikasi itu
// sendiri, jadi status DB baru ditulis setelah kirim sukses): di sini email cuma
// salinan, sumber kebenarannya tetap halaman invoice - fire-and-forget sudah tepat.

function resendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "DannShop <onboarding@resend.dev>";
}

function invoiceUrl(publicToken: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/invoice/${publicToken}`;
}

function formatRupiah(amount: bigint | number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export interface OrderEmailData {
  orderNumber: string;
  publicToken: string;
  buyerEmail: string | null;
  productName: string;
  itemName: string;
  sellingPrice: bigint;
  fee: bigint;
  uniqueCode: number;
  total: bigint;
  paidVia?: "MIDTRANS" | "BALANCE" | null;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const client = resendClient();
    if (!client) {
      console.error("Email: RESEND_API_KEY belum di-set, pengiriman dilewati");
      return false;
    }
    const { error } = await client.emails.send({ from: fromAddress(), to, subject, html });
    if (error) {
      console.error("Email: gagal kirim", { to, subject, error });
      return false;
    }
    return true;
  } catch (e) {
    console.error("Email: gagal kirim", { to, subject, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

function orderSummaryHtml(order: OrderEmailData): string {
  return `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
      <tr><td style="padding:4px 0;color:#666;">Nomor Pesanan</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${order.orderNumber}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Produk</td><td style="padding:4px 0;text-align:right;">${order.productName} · ${order.itemName}</td></tr>
      <tr><td style="padding:4px 0;color:#666;">Harga item</td><td style="padding:4px 0;text-align:right;">${formatRupiah(order.sellingPrice)}</td></tr>
      ${
        order.fee > 0n
          ? `<tr><td style="padding:4px 0;color:#666;">Biaya admin</td><td style="padding:4px 0;text-align:right;">${formatRupiah(order.fee)}</td></tr>`
          : ""
      }
      ${
        order.uniqueCode > 0
          ? `<tr><td style="padding:4px 0;color:#666;">Kode unik</td><td style="padding:4px 0;text-align:right;">${formatRupiah(order.uniqueCode)}</td></tr>`
          : ""
      }
      <tr><td style="padding:8px 0 4px;border-top:1px solid #eee;font-weight:bold;">Total</td><td style="padding:8px 0 4px;border-top:1px solid #eee;text-align:right;font-weight:bold;">${formatRupiah(order.total)}</td></tr>
    </table>
  `;
}

function paymentInstructionsHtml(actions: PaymentActions | null): string {
  if (!actions) return "";
  if (actions.kind === "qris") {
    return `<p>Bayar dengan scan kode QRIS — buka link invoice di bawah untuk menampilkan QR code-nya.</p>`;
  }
  if (actions.kind === "va") {
    return `<p>Transfer ke <strong>Virtual Account ${actions.bank.toUpperCase()}</strong>:</p><p style="font-size:20px;font-weight:bold;letter-spacing:1px;">${actions.vaNumber}</p>`;
  }
  return `<p>Bayar lewat <strong>Mandiri Bill Payment</strong> (ATM/Livin&apos;):</p><p>Kode Perusahaan: <strong>${actions.billerCode}</strong><br/>Kode Bayar: <strong>${actions.billKey}</strong></p>`;
}

function wrapEmail(title: string, bodyHtml: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a2e;">
      <h1 style="font-size:20px;margin-bottom:16px;">${title}</h1>
      ${bodyHtml}
      <p style="margin-top:24px;font-size:12px;color:#999;">Email otomatis dari DannShop, jangan dibalas langsung.</p>
    </div>
  `;
}

export async function sendOrderCreatedEmail(order: OrderEmailData, actions: PaymentActions | null): Promise<boolean> {
  if (!order.buyerEmail) return false;
  const url = invoiceUrl(order.publicToken);
  const html = wrapEmail(
    "Pesanan Anda Diterima",
    `
      <p>Terima kasih, pesanan <strong>${order.orderNumber}</strong> sudah kami terima.</p>
      ${orderSummaryHtml(order)}
      ${order.paidVia === "BALANCE" ? "<p>Pembayaran sudah dipotong dari saldo akun Anda — pesanan sedang diproses.</p>" : paymentInstructionsHtml(actions)}
      <p><a href="${url}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#7C3AED;color:#fff;text-decoration:none;border-radius:8px;">Lihat Invoice</a></p>
    `,
  );
  return send(order.buyerEmail, `Pesanan ${order.orderNumber} Diterima - DannShop`, html);
}

export async function sendOrderCompletedEmail(order: OrderEmailData, sn: string | null): Promise<boolean> {
  if (!order.buyerEmail) return false;
  const url = invoiceUrl(order.publicToken);
  const html = wrapEmail(
    "Pesanan Anda Berhasil!",
    `
      <p>Pesanan <strong>${order.orderNumber}</strong> (${order.productName} · ${order.itemName}) sudah berhasil diproses.</p>
      ${
        sn
          ? `<div style="margin:16px 0;padding:12px;background:#ECFDF5;border-radius:8px;"><p style="margin:0;font-size:12px;color:#666;">Serial Number / Kode Voucher</p><p style="margin:4px 0 0;font-size:18px;font-weight:bold;letter-spacing:1px;">${sn}</p></div>`
          : ""
      }
      <p><a href="${url}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#7C3AED;color:#fff;text-decoration:none;border-radius:8px;">Lihat Invoice</a></p>
    `,
  );
  return send(order.buyerEmail, `Pesanan ${order.orderNumber} Berhasil - DannShop`, html);
}

export async function sendOrderFailedEmail(
  order: OrderEmailData,
  note: string,
  refund: { toWallet: boolean } | null,
): Promise<boolean> {
  if (!order.buyerEmail) return false;
  const url = invoiceUrl(order.publicToken);
  const refundText = refund
    ? refund.toWallet
      ? `<p>Dana sebesar <strong>${formatRupiah(order.total)}</strong> sudah dikembalikan sebagai saldo ke akun Anda.</p>`
      : `<p>Tim kami akan segera memproses pengembalian dana <strong>${formatRupiah(order.total)}</strong> secara manual ke rekening Anda.</p>`
    : "";
  const html = wrapEmail(
    "Ada Kendala pada Pesanan Anda",
    `
      <p>Pesanan <strong>${order.orderNumber}</strong> (${order.productName} · ${order.itemName}) mengalami kendala: ${note}</p>
      ${refundText}
      <p><a href="${url}" style="display:inline-block;margin-top:8px;padding:10px 20px;background:#7C3AED;color:#fff;text-decoration:none;border-radius:8px;">Lihat Detail</a></p>
    `,
  );
  return send(order.buyerEmail, `Pesanan ${order.orderNumber} - Perlu Perhatian - DannShop`, html);
}
