import { Resend } from "resend";
import nodemailer from "nodemailer";
import type { PaymentActions } from "@/lib/midtrans/client";
import { getEmailProviderConfig } from "@/lib/notify/email-config";
import { getEmailTemplates, type EmailTemplateKey } from "@/lib/notify/email-templates";
import { escapeHtml, renderTemplate } from "@/lib/notify/template";
import { getInvoiceBranding, type InvoiceBranding } from "@/lib/invoice/branding";
import { describeOrderTarget } from "@/lib/order/customer-no";

// Pola sama persis dengan sendTelegramAlert (lib/notify/telegram.ts): tidak pernah
// throw, guard clause kalau env kosong, return boolean supaya caller bisa tahu
// status kirim tapi tidak wajib dicek. Kegagalan kirim email TIDAK BOLEH pernah
// menggagalkan pembayaran/fulfillment - semua pemanggilan di checkout.ts/
// fulfillment.ts/orders.ts dibungkus try/catch di dalam sini, bukan di caller.
// Beda dengan sendTelegramAlert Fase 7b (yang deliverable-nya notifikasi itu
// sendiri, jadi status DB baru ditulis setelah kirim sukses): di sini email cuma
// salinan, sumber kebenarannya tetap halaman invoice - fire-and-forget sudah tepat.
//
// Sejak Fase branding: susunan badan email datang dari template yang bisa
// diedit admin (lib/notify/email-templates.ts) dan kerangkanya (logo, header,
// kaki) dari lib/invoice/branding.ts. Nilai data SELALU lewat escapeHtml -
// lihat catatan panjang di lib/notify/template.ts kenapa itu tidak opsional.

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

function invoiceUrl(publicToken: string): string {
  return `${siteUrl()}/invoice/${publicToken}`;
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
  target?: unknown;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const config = await getEmailProviderConfig();
    if (!config) {
      console.error("Email: provider belum dikonfigurasi (Admin > Pengaturan Situs), pengiriman dilewati");
      return false;
    }

    if (config.kind === "resend") {
      const client = new Resend(config.apiKey);
      const { error } = await client.emails.send({ from: config.fromEmail, to, subject, html });
      if (error) {
        console.error("Email: gagal kirim (resend)", { to, subject, error });
        return false;
      }
      return true;
    }

    // SMTP - transporter baru per pengiriman (fire-and-forget, volume rendah,
    // tidak perlu connection pooling jangka panjang untuk pola pemakaian ini).
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
    await transporter.sendMail({ from: config.fromEmail, to, subject, html });
    return true;
  } catch (e) {
    console.error("Email: gagal kirim", { to, subject, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

// ===== Blok HTML yang dibangun sistem (bukan admin) =====

function button(href: string, label: string, accent: string): string {
  return `<p style="margin:20px 0 8px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;background:${accent};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">${escapeHtml(label)}</a></p>`;
}

function orderSummaryHtml(order: OrderEmailData): string {
  const targetText = describeOrderTarget(order.target);
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#666666;font-size:14px;">${escapeHtml(label)}</td><td style="padding:6px 0;text-align:right;font-size:14px;${strong ? "font-weight:bold;" : ""}">${escapeHtml(value)}</td></tr>`;

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;">
      ${row("Nomor Pesanan", order.orderNumber, true)}
      ${row("Produk", `${order.productName} · ${order.itemName}`)}
      ${targetText ? row("Tujuan", targetText) : ""}
      ${row("Harga item", formatRupiah(order.sellingPrice))}
      ${order.fee > 0n ? row("Biaya admin", formatRupiah(order.fee)) : ""}
      ${order.uniqueCode > 0 ? row("Kode unik", formatRupiah(order.uniqueCode)) : ""}
      <tr>
        <td style="padding:10px 0 4px;border-top:1px solid #e5e5e5;font-weight:bold;font-size:15px;">Total</td>
        <td style="padding:10px 0 4px;border-top:1px solid #e5e5e5;text-align:right;font-weight:bold;font-size:15px;">${escapeHtml(formatRupiah(order.total))}</td>
      </tr>
    </table>
  `;
}

function paymentInstructionsHtml(actions: PaymentActions | null, paidVia: OrderEmailData["paidVia"]): string {
  if (paidVia === "BALANCE") {
    return `<p>Pembayaran sudah dipotong dari saldo akunmu — pesanan sedang diproses.</p>`;
  }
  if (!actions) return "";
  if (actions.kind === "qris") {
    return `<p>Bayar dengan scan kode QRIS — buka link invoice di bawah untuk menampilkan QR code-nya.</p>`;
  }
  if (actions.kind === "va") {
    return `<p>Transfer ke <strong>Virtual Account ${escapeHtml(actions.bank.toUpperCase())}</strong>:</p><p style="font-size:20px;font-weight:bold;letter-spacing:1px;">${escapeHtml(actions.vaNumber)}</p>`;
  }
  if (actions.kind === "echannel") {
    return `<p>Bayar lewat <strong>Mandiri Bill Payment</strong> (ATM/Livin&apos;):</p><p>Kode Perusahaan: <strong>${escapeHtml(actions.billerCode)}</strong><br/>Kode Bayar: <strong>${escapeHtml(actions.billKey)}</strong></p>`;
  }
  if (actions.kind === "snap") {
    // Token Snap SENGAJA tidak ditaruh di email: dia cuma bisa dipakai oleh
    // Snap.js di halaman yang memuat client key, jadi menempelkannya di sini
    // tidak berguna. redirect_url pun sengaja tidak dikirim - link invoice
    // adalah satu-satunya pintu yang statusnya ikut terpantau polling kita.
    return `<p>Selesaikan pembayaran lewat link invoice di bawah — tombol pembayarannya ada di sana.</p>`;
  }
  const label = actions.provider === "gopay" ? "GoPay" : "ShopeePay";
  return `<p>Bayar dengan <strong>${label}</strong> — buka link invoice di bawah untuk tombol pembayarannya.</p>`;
}

function snBoxHtml(sn: string | null): string {
  if (!sn) return "";
  return `<div style="margin:16px 0;padding:14px;background:#ECFDF5;border-radius:8px;border:1px solid #A7F3D0;">
    <p style="margin:0;font-size:12px;color:#666666;">Serial Number / Kode Voucher</p>
    <p style="margin:6px 0 0;font-size:18px;font-weight:bold;letter-spacing:1px;word-break:break-all;">${escapeHtml(sn)}</p>
  </div>`;
}

// Kerangka email: logo, nama toko, tagline, badan, lalu kaki berisi kontak &
// kalimat penutup. Tata letak sengaja berbasis <table> dengan CSS inline -
// itu satu-satunya yang dirender konsisten oleh Gmail, Outlook, dan klien
// bawaan ponsel. Flexbox/grid dan <style> di <head> banyak yang dibuang.
function wrapEmail(branding: InvoiceBranding, bodyHtml: string): string {
  const accent = branding.accentColor;
  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.brandName)}" height="40" style="height:40px;max-height:40px;width:auto;display:block;margin:0 auto 10px;border:0;" />`
    : "";
  const contactLines = branding.supportLine
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");
  const addressLines = branding.addressLine
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(branding.brandName)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f4f7;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
        <tr><td style="background:${accent};padding:22px 24px;text-align:center;">
          ${logo}
          <div style="color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:-0.2px;">${escapeHtml(branding.brandName)}</div>
          ${branding.tagline ? `<div style="color:#ffffff;opacity:0.85;font-size:12px;margin-top:3px;">${escapeHtml(branding.tagline)}</div>` : ""}
        </td></tr>
        <tr><td style="padding:24px;font-size:14px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:18px 24px 24px;border-top:1px solid #eeeeee;font-size:12px;color:#8a8a99;line-height:1.6;">
          ${branding.footerText ? `<div style="margin-bottom:8px;">${escapeHtml(branding.footerText)}</div>` : ""}
          ${contactLines}
          ${addressLines}
          <div style="margin-top:10px;color:#b0b0bb;">Email otomatis, mohon jangan dibalas langsung.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Satu jalur untuk semua email bertemplate: ambil branding + template, render
// subjek & badan, bungkus, kirim. Setiap pengirim di bawah cuma menyiapkan
// vars & blocks miliknya.
async function sendTemplated(
  key: EmailTemplateKey,
  to: string,
  ctx: { vars: Record<string, string>; blocks: Record<string, string> },
): Promise<boolean> {
  const [branding, templates] = await Promise.all([getInvoiceBranding(), getEmailTemplates()]);
  const template = templates[key];
  const vars = { ...ctx.vars, brand_name: branding.brandName };
  // Subjek dirender TANPA blocks dan hasilnya di-unescape kembali: header
  // email adalah teks polos, `&amp;` di dalamnya akan terbaca mentah oleh
  // penerima. renderTemplate meng-escape karena hasilnya biasanya HTML.
  const subject = renderTemplate(template.subject, { vars })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const body = renderTemplate(template.body, { vars, blocks: ctx.blocks });
  return send(to, subject, wrapEmail(branding, body));
}

function orderVars(order: OrderEmailData): Record<string, string> {
  return {
    order_number: order.orderNumber,
    product_name: order.productName,
    item_name: order.itemName,
    target: describeOrderTarget(order.target),
    total: formatRupiah(order.total),
    invoice_url: invoiceUrl(order.publicToken),
    buyer_email: order.buyerEmail ?? "",
  };
}

export async function sendOrderCreatedEmail(order: OrderEmailData, actions: PaymentActions | null): Promise<boolean> {
  if (!order.buyerEmail) return false;
  const branding = await getInvoiceBranding();
  return sendTemplated("order_created", order.buyerEmail, {
    vars: orderVars(order),
    blocks: {
      order_table: orderSummaryHtml(order),
      payment_instructions: paymentInstructionsHtml(actions, order.paidVia),
      invoice_button: button(invoiceUrl(order.publicToken), "Lihat Invoice", branding.accentColor),
    },
  });
}

export async function sendOrderCompletedEmail(order: OrderEmailData, sn: string | null): Promise<boolean> {
  if (!order.buyerEmail) return false;
  const branding = await getInvoiceBranding();
  return sendTemplated("order_completed", order.buyerEmail, {
    vars: { ...orderVars(order), sn: sn ?? "" },
    blocks: {
      order_table: orderSummaryHtml(order),
      sn_box: snBoxHtml(sn),
      invoice_button: button(invoiceUrl(order.publicToken), "Lihat Invoice", branding.accentColor),
    },
  });
}

export async function sendOrderFailedEmail(
  order: OrderEmailData,
  note: string,
  refund: { toWallet: boolean } | null,
): Promise<boolean> {
  if (!order.buyerEmail) return false;
  const branding = await getInvoiceBranding();
  const refundNote = refund
    ? refund.toWallet
      ? `<p>Dana sebesar <strong>${escapeHtml(formatRupiah(order.total))}</strong> sudah dikembalikan sebagai saldo ke akunmu.</p>`
      : `<p>Tim kami akan segera memproses pengembalian dana <strong>${escapeHtml(formatRupiah(order.total))}</strong> secara manual.</p>`
    : "";
  return sendTemplated("order_failed", order.buyerEmail, {
    vars: { ...orderVars(order), reason: note },
    blocks: {
      refund_note: refundNote,
      invoice_button: button(invoiceUrl(order.publicToken), "Lihat Detail", branding.accentColor),
    },
  });
}

export async function sendWelcomeEmail(user: { name: string; email: string }): Promise<boolean> {
  const branding = await getInvoiceBranding();
  const loginUrl = `${siteUrl()}/login`;
  return sendTemplated("welcome", user.email, {
    vars: { user_name: user.name, user_email: user.email, login_url: loginUrl, site_url: siteUrl() },
    blocks: { login_button: button(loginUrl, "Masuk ke Akun", branding.accentColor) },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const branding = await getInvoiceBranding();
  return sendTemplated("password_reset", to, {
    vars: { reset_url: resetUrl },
    blocks: { reset_button: button(resetUrl, "Reset Password", branding.accentColor) },
  });
}

// Dikirim ke alamat BARU - inilah satu-satunya yang membawa link konfirmasi.
export async function sendEmailChangeVerifyEmail(
  to: string,
  data: { confirmUrl: string; userName: string; oldEmail: string },
): Promise<boolean> {
  const branding = await getInvoiceBranding();
  return sendTemplated("email_change_verify", to, {
    vars: { confirm_url: data.confirmUrl, user_name: data.userName, old_email: data.oldEmail },
    blocks: { confirm_button: button(data.confirmUrl, "Konfirmasi Email Baru", branding.accentColor) },
  });
}

// Dikirim ke alamat LAMA. SENGAJA tanpa tombol/link konfirmasi: fungsinya
// memperingatkan, bukan menyediakan jalan pintas. Kalau alamat lama juga bisa
// menyetujui perpindahan, penyerang yang membajak sesi tinggal menyetujuinya
// sendiri dan peringatan ini kehilangan seluruh gunanya.
export async function sendEmailChangeNoticeEmail(
  to: string,
  data: { newEmail: string; userName: string },
): Promise<boolean> {
  return sendTemplated("email_change_notice", to, {
    vars: { new_email: data.newEmail, user_name: data.userName },
    blocks: {},
  });
}

// Pratinjau untuk panel admin: merender template dengan data contoh, TANPA
// mengirim apa pun. Dipakai supaya admin bisa melihat hasil suntingannya
// sebelum satu pun pelanggan menerimanya.
export async function renderEmailPreview(key: EmailTemplateKey, template: { subject: string; body: string }): Promise<string> {
  const branding = await getInvoiceBranding();
  const sample: OrderEmailData = {
    orderNumber: "INV-20260809-0042",
    publicToken: "contoh-token",
    buyerEmail: "pembeli@contoh.com",
    productName: "Mobile Legends",
    itemName: "86 Diamonds",
    sellingPrice: 20_000n,
    fee: 1_000n,
    uniqueCode: 137,
    total: 21_137n,
    paidVia: "MIDTRANS",
    target: { user_id: "123456789", zone_id: "1234" },
  };
  const accent = branding.accentColor;
  const vars: Record<string, string> = {
    ...orderVars(sample),
    brand_name: branding.brandName,
    sn: "SN-CONTOH-9F2K1P",
    reason: "Provider sedang gangguan",
    user_name: "Budi Santoso",
    user_email: "budi@contoh.com",
    login_url: `${siteUrl()}/login`,
    site_url: siteUrl(),
    reset_url: `${siteUrl()}/reset-password?token=contoh`,
  };
  const blocks: Record<string, string> = {
    order_table: orderSummaryHtml(sample),
    payment_instructions: `<p>Transfer ke <strong>Virtual Account BCA</strong>:</p><p style="font-size:20px;font-weight:bold;letter-spacing:1px;">8808123456789012</p>`,
    invoice_button: button(invoiceUrl(sample.publicToken), "Lihat Invoice", accent),
    sn_box: snBoxHtml("SN-CONTOH-9F2K1P"),
    refund_note: `<p>Dana sebesar <strong>${escapeHtml(formatRupiah(sample.total))}</strong> sudah dikembalikan sebagai saldo ke akunmu.</p>`,
    login_button: button(`${siteUrl()}/login`, "Masuk ke Akun", accent),
    reset_button: button(`${siteUrl()}/reset-password?token=contoh`, "Reset Password", accent),
  };
  void key;
  return wrapEmail(branding, renderTemplate(template.body, { vars, blocks }));
}
