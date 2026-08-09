import { cache } from "react";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings";

// Pengaturan alur produk manual (App Premium dsb).
//
// Setelah pembayaran diterima, pembeli TIDAK menerima barangnya otomatis -
// admin yang mengirimkannya. Supaya pembeli tidak dibiarkan menebak-nebak, di
// halaman invoice muncul tombol yang membuka WhatsApp/Telegram admin dengan
// pesan yang sudah terisi lengkap. Isi pesannya diatur di sini.
//
// Teksnya PLAIN TEXT, bukan HTML: tujuannya kolom chat, dan di sana escaping
// HTML justru merusak (pembeli membaca "&amp;" mentah). Lihat renderPlainTemplate
// di lib/notify/template.ts.

export type ManualOrderChannel = "whatsapp" | "telegram" | "both";

export interface ManualOrderSettings {
  channel: ManualOrderChannel;
  /** Nomor WhatsApp tujuan konfirmasi, format internasional tanpa "+". */
  whatsappNumber: string;
  /** Username Telegram tujuan, tanpa "@". */
  telegramUsername: string;
  /** Keterangan di halaman invoice, di atas tombol konfirmasi. */
  invoiceNote: string;
  /** Pesan siap kirim yang dibuka di aplikasi chat. */
  messageTemplate: string;
}

export const MANUAL_ORDER_PLACEHOLDERS: { name: string; description: string }[] = [
  { name: "brand_name", description: "Nama toko" },
  { name: "order_number", description: "Nomor pesanan" },
  { name: "product_name", description: "Nama produk" },
  { name: "item_name", description: "Nama paket/item" },
  { name: "target", description: "Data yang diisi pembeli saat checkout" },
  { name: "total", description: "Total yang sudah dibayar" },
  { name: "buyer_email", description: "Email pembeli" },
  { name: "invoice_url", description: "Link invoice pesanan" },
];

const DEFAULT_TEMPLATE = `Halo admin {{brand_name}}, saya sudah membayar pesanan berikut:

No. Pesanan: {{order_number}}
Produk: {{product_name}} - {{item_name}}
Data: {{target}}
Total dibayar: {{total}}
Email: {{buyer_email}}

Link invoice: {{invoice_url}}

Mohon diproses ya, terima kasih.`;

const DEFAULT_NOTE =
  "Pembayaran kamu sudah kami terima. Produk ini dikirim manual oleh admin — kirim konfirmasi di bawah supaya langsung diproses.";

const KEY = "manual_order_settings";

export const getManualOrderSettings = cache(async (): Promise<ManualOrderSettings> => {
  const [row, site] = await Promise.all([
    db.siteSetting.findUnique({ where: { key: KEY } }),
    getSiteSettings(),
  ]);

  let stored: Partial<ManualOrderSettings> = {};
  if (row) {
    try {
      stored = JSON.parse(row.value) as Partial<ManualOrderSettings>;
    } catch {
      // Pengaturan korup tidak boleh menghilangkan tombol konfirmasi - pembeli
      // yang sudah membayar akan terjebak tanpa cara menghubungi admin.
    }
  }

  const channel: ManualOrderChannel =
    stored.channel === "telegram" || stored.channel === "both" ? stored.channel : "whatsapp";

  return {
    channel,
    // Default ke kontak CS yang sudah diisi admin - hampir selalu nomor yang
    // sama, dan menyalinnya ulang cuma menciptakan dua sumber yang bisa beda.
    whatsappNumber: stored.whatsappNumber?.trim() || site.whatsappCs,
    telegramUsername: stored.telegramUsername?.trim() || site.telegramCs,
    invoiceNote: stored.invoiceNote ?? DEFAULT_NOTE,
    messageTemplate: stored.messageTemplate?.trim() || DEFAULT_TEMPLATE,
  };
});

export async function saveManualOrderSettings(settings: ManualOrderSettings): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: KEY, value: JSON.stringify(settings) },
  });
}

export { DEFAULT_TEMPLATE as DEFAULT_MANUAL_ORDER_TEMPLATE };
