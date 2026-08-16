import { db } from "@/lib/db";

// Katalog template email yang boleh diedit admin.
//
// Yang bisa diedit adalah ISI BADAN email + subjeknya. Kerangka luarnya (logo,
// header, kaki, warna aksen) TIDAK ikut diedit di sini - itu datang dari
// lib/invoice/branding.ts dan dipasang di sekeliling badan ini oleh
// lib/notify/email.ts. Dua alasan:
//
//   1. Konsistensi: lima template yang masing-masing memuat salinan header
//      sendiri berarti mengganti logo harus dikerjakan lima kali, dan yang
//      terlupa satu akan diam-diam mengirim logo lama selamanya.
//   2. Keutuhan: badan yang rusak masih menghasilkan email yang terbaca.
//      Kerangka yang rusak menghasilkan email yang tidak bisa dibuka.
//
// Default di bawah adalah isi asli yang dulu hardcode di email.ts - toko yang
// tidak pernah menyentuh halaman ini menerima persis email yang sama.

export const EMAIL_TEMPLATE_KEYS = [
  "order_created",
  "order_completed",
  "order_failed",
  "welcome",
  "password_reset",
  "email_change_verify",
  "email_change_notice",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface EmailTemplateMeta {
  label: string;
  description: string;
  /** Placeholder teks biasa - selalu di-escape saat dirender. */
  vars: { name: string; description: string }[];
  /** Placeholder blok HTML yang dibangun sistem. */
  blocks: { name: string; description: string }[];
  defaultBody: string;
}

const COMMON_ORDER_VARS = [
  { name: "brand_name", description: "Nama toko" },
  { name: "order_number", description: "Nomor pesanan, mis. INV-20260809-0001" },
  { name: "product_name", description: "Nama produk" },
  { name: "item_name", description: "Nama item/nominal" },
  { name: "target", description: "Data tujuan yang diisi pembeli (User ID, nomor, dst)" },
  { name: "total", description: "Total bayar, sudah diformat rupiah" },
  { name: "invoice_url", description: "Link halaman invoice" },
  { name: "buyer_email", description: "Email pembeli" },
];

export const EMAIL_TEMPLATE_META: Record<EmailTemplateKey, EmailTemplateMeta> = {
  order_created: {
    label: "Pesanan Diterima",
    description: "Dikirim tepat setelah checkout, memuat instruksi pembayaran.",
    vars: COMMON_ORDER_VARS,
    blocks: [
      { name: "order_table", description: "Tabel rincian harga, biaya admin, kode unik, dan total" },
      { name: "payment_instructions", description: "Instruksi bayar sesuai metode (QRIS/VA/e-wallet/saldo)" },
      { name: "invoice_button", description: "Tombol 'Lihat Invoice'" },
    ],
    defaultBody: `<p>Terima kasih, pesanan <strong>{{order_number}}</strong> sudah kami terima.</p>
{{order_table}}
{{payment_instructions}}
{{invoice_button}}`,
  },
  order_completed: {
    label: "Pesanan Berhasil",
    description: "Dikirim saat produk berhasil terkirim ke tujuan.",
    vars: [...COMMON_ORDER_VARS, { name: "sn", description: "Serial number / kode voucher (kosong kalau tidak ada)" }],
    blocks: [
      { name: "order_table", description: "Tabel rincian harga dan total" },
      { name: "sn_box", description: "Kotak sorot berisi SN/kode voucher (kosong otomatis kalau tidak ada SN)" },
      { name: "invoice_button", description: "Tombol 'Lihat Invoice'" },
    ],
    defaultBody: `<p>Pesanan <strong>{{order_number}}</strong> ({{product_name}} · {{item_name}}) sudah berhasil diproses.</p>
{{sn_box}}
{{order_table}}
{{invoice_button}}`,
  },
  order_failed: {
    label: "Pesanan Bermasalah",
    description: "Dikirim saat pesanan gagal diproses, termasuk keterangan refund.",
    vars: [...COMMON_ORDER_VARS, { name: "reason", description: "Keterangan singkat penyebab kegagalan" }],
    blocks: [
      { name: "refund_note", description: "Kalimat status pengembalian dana (saldo otomatis / manual / kosong)" },
      { name: "invoice_button", description: "Tombol 'Lihat Detail'" },
    ],
    defaultBody: `<p>Pesanan <strong>{{order_number}}</strong> ({{product_name}} · {{item_name}}) mengalami kendala: {{reason}}</p>
{{refund_note}}
{{invoice_button}}`,
  },
  welcome: {
    label: "Selamat Datang (Pendaftaran)",
    description: "Dikirim ke user yang baru selesai mendaftar.",
    vars: [
      { name: "brand_name", description: "Nama toko" },
      { name: "user_name", description: "Nama user" },
      { name: "user_email", description: "Email user" },
      { name: "login_url", description: "Link halaman login" },
      { name: "site_url", description: "Link beranda toko" },
    ],
    blocks: [{ name: "login_button", description: "Tombol 'Masuk ke Akun'" }],
    defaultBody: `<p>Halo <strong>{{user_name}}</strong>, akunmu di {{brand_name}} sudah aktif.</p>
<p>Sekarang kamu bisa isi saldo untuk bayar lebih cepat, ikut program member untuk dapat diskon, dan melihat seluruh riwayat pesanan di satu tempat.</p>
{{login_button}}
<p style="font-size:13px;color:#666;">Kalau kamu merasa tidak pernah mendaftar, abaikan saja email ini.</p>`,
  },
  password_reset: {
    label: "Reset Password",
    description: "Dikirim saat user meminta reset password lewat halaman Lupa Password.",
    vars: [
      { name: "brand_name", description: "Nama toko" },
      { name: "reset_url", description: "Link reset password (berlaku 30 menit, sekali pakai)" },
    ],
    blocks: [{ name: "reset_button", description: "Tombol 'Reset Password'" }],
    defaultBody: `<p>Kami menerima permintaan reset password untuk akun ini. Klik tombol di bawah untuk membuat password baru.</p>
{{reset_button}}
<p style="margin-top:16px;font-size:13px;color:#666;">Link ini hanya berlaku <strong>30 menit</strong> dan cuma bisa dipakai sekali.</p>
<p style="font-size:13px;color:#666;">Kalau kamu tidak meminta reset password, abaikan saja email ini — passwordmu tidak berubah.</p>`,
  },
  email_change_verify: {
    label: "Konfirmasi Ganti Email",
    description:
      "Dikirim ke alamat BARU saat user mengajukan ganti email. Email baru belum berlaku sampai link di dalamnya diklik.",
    vars: [
      { name: "brand_name", description: "Nama toko" },
      { name: "user_name", description: "Nama pemilik akun" },
      { name: "old_email", description: "Email lama yang sedang dipakai akun" },
      { name: "confirm_url", description: "Link konfirmasi (berlaku 30 menit, sekali pakai)" },
    ],
    blocks: [{ name: "confirm_button", description: "Tombol 'Konfirmasi Email Baru'" }],
    defaultBody: `<p>Halo <strong>{{user_name}}</strong>, ada permintaan untuk memindahkan akun {{brand_name}} dari <strong>{{old_email}}</strong> ke alamat ini.</p>
<p>Klik tombol di bawah untuk menyelesaikannya. Sampai itu dilakukan, email akunmu <strong>belum berubah</strong>.</p>
{{confirm_button}}
<p style="margin-top:16px;font-size:13px;color:#666;">Link ini hanya berlaku <strong>30 menit</strong> dan cuma bisa dipakai sekali.</p>
<p style="font-size:13px;color:#666;">Kalau kamu tidak merasa meminta ini, abaikan saja email ini — tidak ada yang berubah, dan alamat ini tidak akan dipakai.</p>`,
  },
  email_change_notice: {
    label: "Pemberitahuan Ganti Email (ke alamat lama)",
    description:
      "Dikirim ke alamat LAMA saat ada permintaan ganti email. Sengaja tanpa link konfirmasi — ini peringatan, bukan tombol.",
    vars: [
      { name: "brand_name", description: "Nama toko" },
      { name: "user_name", description: "Nama pemilik akun" },
      { name: "new_email", description: "Alamat baru yang diajukan" },
    ],
    blocks: [],
    defaultBody: `<p>Halo <strong>{{user_name}}</strong>, kami menerima permintaan untuk mengubah email akun {{brand_name}} ini menjadi <strong>{{new_email}}</strong>.</p>
<p>Kalau itu memang kamu, tidak ada yang perlu dilakukan di sini — selesaikan lewat link konfirmasi yang kami kirim ke alamat barunya.</p>
<p style="margin-top:16px;font-size:13px;color:#666;"><strong>Kalau ini BUKAN kamu:</strong> akunmu kemungkinan sedang diakses orang lain. Segera ganti passwordmu — mengganti password otomatis mengakhiri seluruh sesi yang sedang berjalan, termasuk milik orang tersebut.</p>`,
  },
};

// Subjek default dipisah dari `default` di atas supaya keduanya tetap bisa
// dibaca sebagai satu blok utuh saat diedit, tanpa string subjek menyelinap di
// tengah HTML.
const DEFAULT_SUBJECTS: Record<EmailTemplateKey, string> = {
  order_created: "Pesanan {{order_number}} Diterima - {{brand_name}}",
  order_completed: "Pesanan {{order_number}} Berhasil - {{brand_name}}",
  order_failed: "Pesanan {{order_number}} - Perlu Perhatian - {{brand_name}}",
  welcome: "Selamat Datang di {{brand_name}}",
  password_reset: "Reset Password - {{brand_name}}",
  email_change_verify: "Konfirmasi Email Baru - {{brand_name}}",
  email_change_notice: "Ada Permintaan Ganti Email - {{brand_name}}",
};

export function defaultTemplate(key: EmailTemplateKey): EmailTemplate {
  return { subject: DEFAULT_SUBJECTS[key], body: EMAIL_TEMPLATE_META[key].defaultBody };
}

const KEY = "email_templates";

export type EmailTemplateMap = Record<EmailTemplateKey, EmailTemplate>;

export async function getEmailTemplates(): Promise<EmailTemplateMap> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  let stored: Partial<Record<EmailTemplateKey, Partial<EmailTemplate>>> = {};
  if (row) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      // Konfigurasi korup tidak boleh membuat toko berhenti mengirim email -
      // jatuh ke default, sama seperti site-settings.ts memperlakukan FAQ.
    }
  }
  return Object.fromEntries(
    EMAIL_TEMPLATE_KEYS.map((k) => {
      const fallback = defaultTemplate(k);
      const saved = stored[k];
      return [
        k,
        {
          subject: saved?.subject?.trim() || fallback.subject,
          // Badan kosong berarti "pakai default", bukan "kirim email kosong".
          body: saved?.body?.trim() || fallback.body,
        },
      ];
    }),
  ) as EmailTemplateMap;
}

export async function saveEmailTemplate(key: EmailTemplateKey, template: EmailTemplate): Promise<void> {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  let stored: Record<string, EmailTemplate> = {};
  if (row) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = {};
    }
  }
  stored[key] = template;
  const value = JSON.stringify(stored);
  await db.siteSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}
