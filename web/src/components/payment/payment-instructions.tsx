"use client";

import { useState } from "react";
import Script from "next/script";
import { Copy, Check, ExternalLink, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentActions } from "@/lib/midtrans/client";
import type { SnapBrowserConfig } from "@/lib/payment/gateway-config";

// Instruksi pembayaran (QRIS / VA / Mandiri bill / e-wallet). Sebelumnya blok
// ini disalin identik di invoice-status.tsx dan deposit-status.tsx, sehingga
// bug tata letak nomor VA yang meluber muncul dua kali dan tiap metode
// pembayaran baru harus ditambahkan dua kali. Sekarang satu tempat.

const EWALLET_LABEL: Record<string, string> = {
  gopay: "GoPay",
  shopeepay: "ShopeePay",
};

export function PaymentInstructions({
  payment,
  qrDataUri,
  snapConfig,
}: {
  payment: PaymentActions | null;
  /** QRIS: data URI hasil render di server dari qr_string. Metode lain: null. */
  qrDataUri: string | null;
  /** Hanya terisi kalau pembayaran ini dibuat lewat mode Snap. */
  snapConfig?: SnapBrowserConfig | null;
}) {
  const [copied, setCopied] = useState(false);
  const [snapReady, setSnapReady] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API bisa tidak tersedia (mis. http tanpa TLS) — abaikan diam-diam
    }
  }

  if (!payment) return null;

  if (payment.kind === "snap") {
    // Instruksi pembayarannya ada DI DALAM popup Midtrans, jadi di sini kita
    // cuma menyediakan pemicunya. redirect_url disediakan sebagai jalan keluar
    // kalau Snap.js gagal dimuat (pemblokir iklan, jaringan korporat) - tanpa
    // itu, pembeli yang skripnya diblokir tidak punya cara membayar sama sekali.
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border p-4">
        {snapConfig && (
          <Script
            src={snapConfig.scriptUrl}
            data-client-key={snapConfig.clientKey}
            strategy="afterInteractive"
            onReady={() => setSnapReady(true)}
          />
        )}
        <p className="text-sm text-muted-foreground">Selesaikan pembayaran Anda</p>
        {/* Tombol popup HANYA dirender kalau client key-nya benar-benar ada.
            Skenario nyatanya: admin memindahkan toggle kembali ke Core API (atau
            mengosongkan client key) setelah order ini terbentuk - order lama
            tetap sah dan masih bisa dibayar, tapi popup-nya sudah mustahil
            dimuat. Menampilkan tombol mati di situ hanya membuat pembeli
            mengira pembayarannya rusak; link di bawah tetap jalan. */}
        {snapConfig && (
          <Button
            type="button"
            className="w-full"
            disabled={!snapReady}
            onClick={() => window.snap?.pay(payment.token)}
          >
            <CreditCard className="size-4" aria-hidden="true" />
            {snapReady ? "Bayar Sekarang" : "Menyiapkan pembayaran..."}
          </Button>
        )}
        <a
          href={payment.redirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Buka halaman pembayaran di tab baru
        </a>
        <p className="text-xs text-muted-foreground">
          Setelah membayar, kembali ke halaman ini — status akan diperbarui otomatis.
        </p>
      </div>
    );
  }

  if (payment.kind === "qris") {
    // QR di-generate SEKALI saat charge dan disimpan di DB - gambar ini tidak
    // pernah berubah selama order hidup, walau halaman polling status tiap
    // beberapa detik. Aman di-screenshot lalu dibayar dari aplikasi lain.
    if (!qrDataUri) return null;
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">Scan QRIS untuk membayar</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="QRIS pembayaran" src={qrDataUri} width={240} height={240} />
      </div>
    );
  }

  if (payment.kind === "va") {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Transfer ke Virtual Account {payment.bank.toUpperCase()}</p>
        {/* min-w-0 + break-all di span dan shrink-0 di tombol: tanpa itu nomor VA
            16 digit (apalagi dengan tracking-wide) menolak menyusut di layar
            sempit dan menabrak tombol Salin sampai keluar dari kartunya. */}
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 font-mono text-xl font-bold tracking-wide break-all">{payment.vaNumber}</span>
          <Button type="button" size="xs" variant="outline" className="shrink-0" onClick={() => copy(payment.vaNumber)}>
            {copied ? (
              <>
                <Check className="size-3.5" /> Tersalin
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Salin
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (payment.kind === "echannel") {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Bayar lewat Mandiri Bill Payment (ATM/Livin&apos;)</p>
        <div className="flex justify-between gap-3 text-sm">
          <span className="shrink-0 text-muted-foreground">Kode Perusahaan</span>
          <span className="min-w-0 font-mono font-bold break-all">{payment.billerCode}</span>
        </div>
        <div className="flex justify-between gap-3 text-sm">
          <span className="shrink-0 text-muted-foreground">Kode Bayar</span>
          <span className="min-w-0 font-mono font-bold break-all">{payment.billKey}</span>
        </div>
      </div>
    );
  }

  // E-wallet: GoPay memberi deeplink + QR, ShopeePay hanya deeplink.
  const label = EWALLET_LABEL[payment.provider] ?? payment.provider;
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border p-4">
      <p className="text-sm text-muted-foreground">Bayar dengan {label}</p>
      {payment.qrUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`QR ${label}`} src={payment.qrUrl} width={240} height={240} className="max-w-full" />
          <p className="text-xs text-muted-foreground">Scan dari perangkat lain, atau tekan tombol di bawah</p>
        </>
      )}
      <a
        href={payment.deeplink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        Buka aplikasi {label}
      </a>
      {/* Midtrans tidak dikirimi callback_url, jadi aplikasi e-wallet tidak
          otomatis melempar balik ke sini. Status tetap ketahuan sendiri lewat
          polling + lazy reconcile, tapi user perlu tahu supaya tidak mengira
          pembayarannya gagal saat tab ini tidak berubah seketika. */}
      <p className="text-xs text-muted-foreground">
        Setelah membayar, kembali ke halaman ini — status akan diperbarui otomatis.
      </p>
    </div>
  );
}
