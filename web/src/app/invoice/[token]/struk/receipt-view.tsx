"use client";

import { useState } from "react";
import { Printer, Download, Smartphone, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaperSize } from "@/lib/invoice/branding";

interface A4Data {
  tagline: string;
  addressLines: string[];
  supportLines: string[];
  footerText: string;
  orderNumber: string;
  createdAt: string;
  statusLabel: string;
  productName: string;
  itemName: string;
  target: string;
  paymentMethod: string;
  sellingPrice: string;
  fee: string;
  uniqueCode: number;
  total: string;
  sn: string | null;
  invoiceUrl: string;
}

const PAPERS: { key: PaperSize; label: string; hint: string }[] = [
  { key: "58", label: "58 mm", hint: "Printer termal kecil (32 kolom)" },
  { key: "80", label: "80 mm", hint: "Printer termal kasir (48 kolom)" },
  { key: "a4", label: "A4 / PDF", hint: "Cetak biasa atau simpan sebagai PDF" },
];

function rupiah(value: string): string {
  return `Rp${Number(value).toLocaleString("id-ID")}`;
}

export function ReceiptView({
  brandName,
  accentColor,
  logoUrl,
  defaultPaper,
  qrDataUri,
  text58,
  text80,
  a4,
}: {
  brandName: string;
  accentColor: string;
  logoUrl: string | null;
  defaultPaper: PaperSize;
  qrDataUri: string | null;
  text58: string;
  text80: string;
  a4: A4Data;
}) {
  const [paper, setPaper] = useState<PaperSize>(defaultPaper);
  const [copied, setCopied] = useState(false);
  const thermalText = paper === "80" ? text80 : text58;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(thermalText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API ditolak (konteks non-HTTPS / izin browser). Tidak ada
      // yang perlu dilakukan - teksnya toh sudah tampil dan bisa diblok manual.
    }
  }

  // Menyerahkan struk ke aplikasi pencetak Android lewat skema URL `rawbt:`.
  // Ini jalur yang benar untuk printer Bluetooth: browser tidak punya akses
  // langsung ke printer termal (Web Bluetooth tidak ada di iOS dan menuntut
  // implementasi ESC/POS sendiri), sementara aplikasi pencetak sudah menangani
  // pemasangan perangkat, encoding, dan pemotongan kertas.
  function printBluetooth() {
    window.location.href = `rawbt:${encodeURIComponent(thermalText)}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border p-4 print:hidden">
        <div>
          <p className="text-sm font-semibold">Ukuran kertas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PAPERS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPaper(p.key)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  paper === p.key ? "border-primary bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="block text-xs text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden="true" />
            Cetak
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Download className="size-4" aria-hidden="true" />
            Simpan PDF
          </Button>
          {paper !== "a4" && (
            <>
              <Button type="button" variant="outline" onClick={printBluetooth}>
                <Smartphone className="size-4" aria-hidden="true" />
                Printer Bluetooth
              </Button>
              <Button type="button" variant="outline" onClick={copyText}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? "Tersalin" : "Salin Teks"}
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {paper === "a4"
            ? "Di dialog cetak, pilih tujuan “Save as PDF” untuk menyimpan sebagai berkas."
            : "Tombol “Printer Bluetooth” membuka aplikasi pencetak termal di ponsel (mis. RawBT) — pasang dulu aplikasinya dan pasangkan printernya. Kalau printer tersambung lewat kabel/jaringan, pakai tombol “Cetak” biasa."}
        </p>
      </div>

      {/* Ukuran kertas dipasang sebagai variabel CSS lalu dipakai @page di
          globals.css — @page tidak bisa membaca nilai dari React secara
          langsung, dan aturannya harus ada di stylesheet, bukan di elemen. */}
      <style>{`@page { size: ${paper === "a4" ? "A4" : `${paper}mm auto`}; margin: ${paper === "a4" ? "14mm" : "2mm"}; }`}</style>

      {paper === "a4" ? (
        <div className="receipt-sheet mx-auto w-full rounded-xl border bg-white p-8 text-black print:rounded-none print:border-0 print:p-0">
          <div className="flex items-start justify-between gap-6 border-b pb-5" style={{ borderColor: accentColor }}>
            <div className="flex items-center gap-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- logo bisa berupa URL blob eksternal & harus ikut tercetak apa adanya
                <img src={logoUrl} alt={brandName} className="h-12 w-auto object-contain" />
              )}
              <div>
                <p className="text-xl font-bold" style={{ color: accentColor }}>
                  {brandName}
                </p>
                {a4.tagline && <p className="text-xs text-neutral-500">{a4.tagline}</p>}
              </div>
            </div>
            <div className="text-right text-xs text-neutral-600">
              <p className="text-sm font-semibold text-black">STRUK TRANSAKSI</p>
              <p>{a4.orderNumber}</p>
              <p>{new Date(a4.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
              <p>Status: {a4.statusLabel}</p>
            </div>
          </div>

          <table className="mt-5 w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1.5 text-neutral-500">Produk</td>
                <td className="py-1.5 text-right">
                  {a4.productName} · {a4.itemName}
                </td>
              </tr>
              {a4.target && (
                <tr>
                  <td className="py-1.5 text-neutral-500">Tujuan</td>
                  <td className="py-1.5 text-right">{a4.target}</td>
                </tr>
              )}
              {a4.paymentMethod && (
                <tr>
                  <td className="py-1.5 text-neutral-500">Metode bayar</td>
                  <td className="py-1.5 text-right uppercase">{a4.paymentMethod}</td>
                </tr>
              )}
              <tr>
                <td className="py-1.5 text-neutral-500">Harga item</td>
                <td className="py-1.5 text-right">{rupiah(a4.sellingPrice)}</td>
              </tr>
              {a4.fee !== "0" && (
                <tr>
                  <td className="py-1.5 text-neutral-500">Biaya admin</td>
                  <td className="py-1.5 text-right">{rupiah(a4.fee)}</td>
                </tr>
              )}
              {a4.uniqueCode > 0 && (
                <tr>
                  <td className="py-1.5 text-neutral-500">Kode unik</td>
                  <td className="py-1.5 text-right">{rupiah(String(a4.uniqueCode))}</td>
                </tr>
              )}
              <tr>
                <td className="border-t border-neutral-300 pt-2.5 text-base font-bold">Total</td>
                <td className="border-t border-neutral-300 pt-2.5 text-right text-base font-bold">
                  {rupiah(a4.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {a4.sn && (
            <div className="mt-5 rounded-lg bg-neutral-100 p-3">
              <p className="text-xs text-neutral-500">Serial Number / Kode Voucher</p>
              <p className="mt-1 font-mono text-base font-bold break-all">{a4.sn}</p>
            </div>
          )}

          <div className="mt-6 flex items-end justify-between gap-6 border-t pt-4 text-xs text-neutral-500">
            <div>
              {a4.footerText && <p className="mb-2 text-neutral-700">{a4.footerText}</p>}
              {a4.supportLines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              {a4.addressLines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <p className="mt-2 break-all">{a4.invoiceUrl}</p>
            </div>
            {qrDataUri && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI, tidak ada gunanya lewat optimizer
              <img src={qrDataUri} alt="QR invoice" className="size-24 shrink-0" />
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full">
          <div
            className="receipt-sheet mx-auto bg-white p-3 text-black shadow-sm print:p-0 print:shadow-none"
            style={{ width: paper === "80" ? "80mm" : "58mm" }}
          >
            {/* Struk termal SELALU monospasi: perataan kolomnya sudah dirakit
                sebagai spasi di dalam teks (lihat lib/invoice/receipt-text.ts),
                jadi font proporsional apa pun akan merusaknya. */}
            <pre className="m-0 font-mono text-[10px] leading-[1.35] whitespace-pre">{thermalText}</pre>
            {qrDataUri && (
              <div className="mt-2 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI */}
                <img src={qrDataUri} alt="QR invoice" className="size-20" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
