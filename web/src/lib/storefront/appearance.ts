import { cache } from "react";
import { db } from "@/lib/db";
import { sanitizeCss, sanitizeHtml } from "@/lib/storefront/sanitize-html";
import { sanitizeHexColor } from "@/lib/invoice/branding";

// Kustomisasi tampilan storefront oleh admin.
//
// RUANG LINGKUPNYA DISENGAJA TERBATAS, dan ini keputusan desain, bukan
// kekurangan. Yang bisa diubah admin: warna & radius tema, CSS kustom, teks
// pada halaman-halaman kunci, dan potongan HTML pada SLOT yang sudah
// ditentukan. Yang TIDAK bisa: mengganti markup halaman login, checkout,
// invoice, atau deposit.
//
// Alasannya bukan kemalasan. Halaman-halaman itu komponen React ber-state yang
// menjalankan Snap.js, polling status pembayaran tiap tiga detik, dan Server
// Action ber-CSRF. Markup buatan admin tidak akan tersambung ke satu pun di
// antaranya - tombol bayarnya akan terlihat benar tapi tidak melakukan apa-apa,
// dan kerusakan itu baru ketahuan dari pembeli yang uangnya sudah keluar.
// Model "slot" memberi keleluasaan tata letak di sekeliling alur pembayaran
// tanpa membuat alur pembayarannya sendiri bisa dipatahkan.

export const SLOT_KEYS = [
  "home_top",
  "home_bottom",
  "product_list",
  "product_detail_top",
  "product_detail_bottom",
  "checkout_note",
  "invoice_top",
  "invoice_bottom",
  "receipt_note",
  "deposit_note",
  "login_note",
  "register_note",
] as const;

export type SlotKey = (typeof SLOT_KEYS)[number];

export const SLOT_META: Record<SlotKey, { label: string; description: string }> = {
  home_top: { label: "Beranda — atas", description: "Di atas banner carousel." },
  home_bottom: { label: "Beranda — bawah", description: "Di bawah daftar kategori." },
  product_list: { label: "Daftar produk (kategori)", description: "Di atas grid produk halaman kategori." },
  product_detail_top: { label: "Detail produk — atas", description: "Di atas form pemesanan." },
  product_detail_bottom: { label: "Detail produk — bawah", description: "Di bawah tombol beli. Cocok untuk cara pesan / syarat." },
  checkout_note: { label: "Form checkout", description: "Di dalam form, tepat di atas tombol bayar." },
  invoice_top: { label: "Halaman transaksi — atas", description: "Di atas kartu status pesanan." },
  invoice_bottom: { label: "Halaman transaksi — bawah", description: "Di bawah tombol-tombol invoice." },
  receipt_note: { label: "Halaman cetak struk", description: "Di atas pratinjau struk. Tidak ikut tercetak." },
  deposit_note: { label: "Halaman deposit saldo", description: "Di atas form isi saldo." },
  login_note: { label: "Halaman login", description: "Di bawah form login." },
  register_note: { label: "Halaman pendaftaran", description: "Di bawah form daftar." },
};

export interface StorefrontAppearance {
  primaryColor: string;
  radiusPx: number;
  customCss: string;
  slots: Record<SlotKey, string>;
}

const KEY = "storefront_appearance";

const DEFAULT_RADIUS = 10;

function emptySlots(): Record<SlotKey, string> {
  return Object.fromEntries(SLOT_KEYS.map((k) => [k, ""])) as Record<SlotKey, string>;
}

/**
 * Membaca pengaturan dan MENYARINGNYA saat dibaca, bukan hanya saat disimpan.
 *
 * Penyaringan ganda disengaja: baris SiteSetting bisa saja pernah ditulis
 * lewat jalur lain (skrip migrasi, akses DB langsung, versi kode yang lebih
 * lama), dan halaman publik tidak boleh bergantung pada asumsi bahwa semua
 * yang ada di DB pasti sudah bersih.
 */
export const getStorefrontAppearance = cache(async (): Promise<StorefrontAppearance> => {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  let stored: Partial<StorefrontAppearance> = {};
  if (row) {
    try {
      stored = JSON.parse(row.value) as Partial<StorefrontAppearance>;
    } catch {
      // Pengaturan korup tidak boleh menjatuhkan storefront - jatuh ke default.
    }
  }

  const slots = emptySlots();
  if (stored.slots && typeof stored.slots === "object") {
    for (const key of SLOT_KEYS) {
      const raw = (stored.slots as Record<string, unknown>)[key];
      if (typeof raw === "string") slots[key] = sanitizeHtml(raw);
    }
  }

  return {
    primaryColor: sanitizeHexColor(stored.primaryColor, ""),
    radiusPx:
      typeof stored.radiusPx === "number" && stored.radiusPx >= 0 && stored.radiusPx <= 32
        ? stored.radiusPx
        : DEFAULT_RADIUS,
    customCss: sanitizeCss(typeof stored.customCss === "string" ? stored.customCss : ""),
    slots,
  };
});

export async function saveStorefrontAppearance(input: {
  primaryColor: string;
  radiusPx: number;
  customCss: string;
  slots: Record<string, string>;
}): Promise<void> {
  const slots = emptySlots();
  for (const key of SLOT_KEYS) {
    const raw = input.slots[key];
    if (typeof raw === "string") slots[key] = sanitizeHtml(raw);
  }
  const value: StorefrontAppearance = {
    primaryColor: sanitizeHexColor(input.primaryColor, ""),
    radiusPx: Math.min(32, Math.max(0, Math.round(input.radiusPx))),
    customCss: sanitizeCss(input.customCss),
    slots,
  };
  await db.siteSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(value) },
    create: { key: KEY, value: JSON.stringify(value) },
  });
}

/** true kalau ada sesuatu yang perlu disuntikkan ke <head> sama sekali. */
export function hasThemeOverride(appearance: StorefrontAppearance): boolean {
  return appearance.primaryColor !== "" || appearance.radiusPx !== DEFAULT_RADIUS || appearance.customCss !== "";
}
