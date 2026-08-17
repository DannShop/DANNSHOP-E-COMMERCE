"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Send } from "lucide-react";

// Panel konfirmasi untuk order produk manual (App Premium dsb).
//
// Pesannya sudah dirender penuh di server (lihat invoice/[token]/page.tsx) -
// komponen ini tidak menyusun teks apa pun sendiri. Alasannya sama dengan
// struk: satu-satunya sumber kebenaran template ada di pengaturan admin, dan
// merender ulang di klien membuka celah untuk dua hasil yang berbeda.
export function ManualOrderConfirm({
  note,
  message,
  whatsappUrl,
  telegramUrl,
}: {
  note: string;
  message: string;
  whatsappUrl: string | null;
  telegramUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard ditolak browser - teksnya toh sudah tampil dan bisa diblok manual.
    }
  }

  return (
    <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Selesaikan pesananmu</p>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Konfirmasi via WhatsApp
          </a>
        )}
        {telegramUrl && (
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            <Send className="size-4" aria-hidden="true" />
            Konfirmasi via Telegram
          </a>
        )}
        {/* Telegram tidak mendukung pengisian teks pesan lewat link (t.me hanya
            membuka percakapan), jadi tombol salin bukan pelengkap opsional -
            itu satu-satunya cara pembeli membawa detail pesanannya ke sana. */}
        <button
          type="button"
          onClick={copyMessage}
          className="flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Pesan tersalin" : "Salin pesan konfirmasi"}
        </button>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">Lihat isi pesan</summary>
        {/* break-words WAJIB berdampingan dengan whitespace-pre-wrap: yang
            terakhir cuma memelihara baris baru & memutus di SPASI, sementara
            URL invoice sepanjang 60+ karakter tidak punya satu pun spasi -
            jadi ia meluber keluar bingkai tanpa ada yang menahannya. */}
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted/60 p-3 text-xs break-words whitespace-pre-wrap">
          {message}
        </pre>
      </details>
    </div>
  );
}
