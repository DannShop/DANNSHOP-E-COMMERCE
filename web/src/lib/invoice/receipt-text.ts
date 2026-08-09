import type { PaperSize } from "@/lib/invoice/branding";

// Struk versi TEKS POLOS, dilebarkan sesuai kertas termal.
//
// Angka lebarnya bukan karangan: printer termal mencetak dengan font monospasi
// berukuran tetap (Font A, 12x24 dot), sehingga jumlah karakter per baris
// ditentukan oleh lebar cetak kertasnya.
//
//   kertas 58 mm -> area cetak ~48 mm -> 32 karakter per baris
//   kertas 80 mm -> area cetak ~72 mm -> 48 karakter per baris
//
// Dipakai dua tempat: pratinjau/cetak di halaman struk, dan tombol "kirim ke
// printer Bluetooth" yang menyerahkan teks ini ke aplikasi pencetak Android
// (RawBT dkk) lewat skema URL. Browser TIDAK bisa mencetak langsung ke printer
// termal Bluetooth sendiri - Web Bluetooth tidak tersedia di iOS sama sekali
// dan menuntut implementasi ESC/POS penuh di sisi kita - jadi jalur yang benar
// memang menyerahkannya ke aplikasi pencetak yang sudah ada.

export const RECEIPT_WIDTH: Record<Exclude<PaperSize, "a4">, number> = { "58": 32, "80": 48 };

export interface ReceiptData {
  brandName: string;
  tagline: string;
  addressLines: string[];
  supportLines: string[];
  footerText: string;
  orderNumber: string;
  createdAt: Date;
  statusLabel: string;
  productName: string;
  itemName: string;
  target: string;
  paymentMethod: string;
  sellingPrice: bigint;
  fee: bigint;
  uniqueCode: number;
  total: bigint;
  sn: string | null;
  invoiceUrl: string;
}

function rupiah(amount: bigint | number): string {
  return `Rp${Number(amount).toLocaleString("id-ID")}`;
}

function center(text: string, width: number): string {
  const trimmed = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return " ".repeat(pad) + trimmed;
}

// Label di kiri, nilai rata kanan. Kalau keduanya tidak muat dalam satu baris,
// nilai turun ke baris berikutnya (rata kanan) alih-alih dipotong - nominal
// uang yang terpotong pada struk jauh lebih buruk daripada struk yang lebih
// panjang satu baris.
function pair(label: string, value: string, width: number): string[] {
  if (label.length + value.length + 1 <= width) {
    return [label + " ".repeat(width - label.length - value.length) + value];
  }
  return [label.slice(0, width), value.padStart(width).slice(-width)];
}

/** Memotong teks panjang jadi beberapa baris selebar kertas, memutus di spasi bila bisa. */
function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let rest = paragraph.trim();
    if (rest === "") continue;
    while (rest.length > width) {
      const cut = rest.lastIndexOf(" ", width);
      const at = cut > width * 0.5 ? cut : width;
      out.push(rest.slice(0, at));
      rest = rest.slice(at).trim();
    }
    if (rest !== "") out.push(rest);
  }
  return out;
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function buildReceiptText(data: ReceiptData, paper: Exclude<PaperSize, "a4">): string {
  const w = RECEIPT_WIDTH[paper];
  const divider = "-".repeat(w);
  const lines: string[] = [];

  lines.push(center(data.brandName.toUpperCase(), w));
  if (data.tagline) lines.push(...wrap(data.tagline, w).map((l) => center(l, w)));
  for (const l of data.addressLines) lines.push(...wrap(l, w).map((x) => center(x, w)));
  for (const l of data.supportLines) lines.push(...wrap(l, w).map((x) => center(x, w)));
  lines.push(divider);

  lines.push(...pair("No.", data.orderNumber, w));
  lines.push(...pair("Tanggal", formatDateTime(data.createdAt), w));
  lines.push(...pair("Status", data.statusLabel, w));
  if (data.paymentMethod) lines.push(...pair("Bayar", data.paymentMethod, w));
  lines.push(divider);

  lines.push(...wrap(data.productName, w));
  lines.push(...wrap(data.itemName, w));
  if (data.target) {
    lines.push("Tujuan:");
    lines.push(...wrap(data.target, w));
  }
  lines.push(divider);

  lines.push(...pair("Harga", rupiah(data.sellingPrice), w));
  if (data.fee > 0n) lines.push(...pair("Biaya admin", rupiah(data.fee), w));
  if (data.uniqueCode > 0) lines.push(...pair("Kode unik", rupiah(data.uniqueCode), w));
  lines.push(divider);
  lines.push(...pair("TOTAL", rupiah(data.total), w));

  if (data.sn) {
    lines.push(divider);
    lines.push("SN / KODE:");
    lines.push(...wrap(data.sn, w));
  }

  lines.push(divider);
  if (data.footerText) lines.push(...wrap(data.footerText, w).map((l) => center(l, w)));
  lines.push(...wrap(data.invoiceUrl, w).map((l) => center(l, w)));

  return lines.join("\n");
}
