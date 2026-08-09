import { cache } from "react";
import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/site-settings";

// Identitas yang muncul di SETIAP dokumen yang keluar dari sistem ke pembeli:
// email invoice, email notifikasi, halaman invoice, dan struk cetak.
//
// Dipisahkan dari SiteSettings biasa (lib/site-settings.ts) karena dipakai juga
// dari luar konteks request React - pengiriman email berjalan di job runner dan
// webhook, di mana getSiteSettings() yang dibungkus cache() tidak memberi
// manfaat apa pun. Logo sengaja jatuh ke logo situs kalau tidak diisi khusus:
// hampir semua toko memakai logo yang sama di dua tempat, dan memaksa upload
// dua kali cuma bikin salah satunya lupa diperbarui.

export type PaperSize = "58" | "80" | "a4";

export interface InvoiceBranding {
  brandName: string;
  /** Logo khusus dokumen. null = pakai logo situs. */
  logoUrl: string | null;
  /** Warna aksen (hex) untuk header email & garis struk. */
  accentColor: string;
  /** Satu baris di bawah nama brand, mis. "Topup Game & PPOB Termurah". */
  tagline: string;
  /** Alamat / info badan usaha, boleh multi-baris. */
  addressLine: string;
  /** Kontak yang dicetak di dokumen (WA/email/IG). Boleh multi-baris. */
  supportLine: string;
  /** Kalimat penutup di kaki dokumen. */
  footerText: string;
  /** Tampilkan QR link invoice di struk supaya pembeli bisa cek status sendiri. */
  showQrOnReceipt: boolean;
  /** Ukuran kertas yang dipilih duluan saat halaman struk dibuka. */
  defaultPaperSize: PaperSize;
}

const KEY = "invoice_branding";

const DEFAULTS: Omit<InvoiceBranding, "brandName" | "logoUrl"> = {
  accentColor: "#7C3AED",
  tagline: "Topup Game & PPOB Otomatis 24 Jam",
  addressLine: "",
  supportLine: "",
  footerText: "Terima kasih sudah berbelanja. Simpan struk ini sebagai bukti transaksi.",
  showQrOnReceipt: true,
  defaultPaperSize: "58",
};

function isPaperSize(v: unknown): v is PaperSize {
  return v === "58" || v === "80" || v === "a4";
}

// Divalidasi, bukan dipercaya: nilai ini ditulis langsung ke atribut `style`
// dokumen HTML. String sembarang dari DB yang korup (atau diisi lewat jalur
// lain di masa depan) tidak boleh bisa keluar dari konteks nilai CSS.
export function sanitizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : fallback;
}

export const getInvoiceBranding = cache(async (): Promise<InvoiceBranding> => {
  const [row, site] = await Promise.all([
    db.siteSetting.findUnique({ where: { key: KEY } }),
    getSiteSettings(),
  ]);

  let stored: Partial<InvoiceBranding> = {};
  if (row) {
    try {
      stored = JSON.parse(row.value) as Partial<InvoiceBranding>;
    } catch {
      // JSON korup - jangan sampai seluruh pengiriman email ikut mati gara-gara
      // satu baris pengaturan yang rusak. Jatuh ke default.
    }
  }

  return {
    brandName: stored.brandName?.trim() || "DannShop",
    // Logo khusus dokumen kalau ada; kalau tidak, logo situs - TAPI hanya kalau
    // logo situs berupa gambar. Logo bertipe video tidak bisa dirender klien
    // email mana pun maupun printer termal.
    logoUrl: stored.logoUrl?.trim() || (site.logoType === "image" ? site.logoUrl : null),
    accentColor: sanitizeHexColor(stored.accentColor, DEFAULTS.accentColor),
    tagline: stored.tagline ?? DEFAULTS.tagline,
    addressLine: stored.addressLine ?? DEFAULTS.addressLine,
    // Default kontak diambil dari CS yang sudah diisi admin di halaman yang
    // sama - hampir pasti itu yang mau dicetak, dan mengetiknya ulang cuma
    // menciptakan dua sumber kebenaran yang bisa berbeda.
    supportLine:
      stored.supportLine ??
      [site.whatsappCs ? `WhatsApp: ${site.whatsappCs}` : "", site.telegramCs ? `Telegram: @${site.telegramCs}` : ""]
        .filter(Boolean)
        .join("\n"),
    footerText: stored.footerText ?? DEFAULTS.footerText,
    showQrOnReceipt: stored.showQrOnReceipt !== false,
    defaultPaperSize: isPaperSize(stored.defaultPaperSize) ? stored.defaultPaperSize : DEFAULTS.defaultPaperSize,
  };
});

export async function saveInvoiceBranding(branding: InvoiceBranding): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(branding) },
    create: { key: KEY, value: JSON.stringify(branding) },
  });
}
