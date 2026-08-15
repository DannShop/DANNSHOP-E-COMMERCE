import type { Metadata, Viewport } from "next";
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ToastProvider } from "@/components/ui/toast";
import { getSiteSettings } from "@/lib/site-settings";
import { StorefrontTheme } from "@/components/storefront-theme";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { getInvoiceBranding } from "@/lib/invoice/branding";
import { getPwaSettings } from "@/lib/pwa/settings";
import { resolveAppNames, resolveIcon } from "@/lib/pwa/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baloo2 = Baloo_2({
  variable: "--font-baloo",
  weight: ["700"],
  subsets: ["latin"],
});

const STATIC_METADATA: Metadata = {
  title: { default: "DannShop — Topup Game & PPOB", template: "%s | DannShop" },
  description:
    "Topup game, pulsa, e-money, dan PLN — murah, cepat, otomatis 24 jam.",
};

// generateMetadata (bukan `export const metadata` statis) supaya favicon
// yang admin upload lewat /admin/settings ikut kepakai - kalau belum pernah
// diisi, dipakai app/favicon.ico bawaan.
//
// Sejak ada aplikasi mobile, `icons` SELALU terisi (minimal apple-touch-icon),
// jadi jalur "biarkan undefined supaya Next.js jatuh balik sendiri" tidak lagi
// tersedia - favicon-nya ditunjuk eksplisit ke /favicon.ico. Hasil akhirnya
// identik, cuma tidak lagi bergantung pada perilaku fallback Next.js.
export async function generateMetadata(): Promise<Metadata> {
  const [settings, pwa, branding] = await Promise.all([
    getSiteSettings(),
    getPwaSettings(),
    getInvoiceBranding(),
  ]);
  const { name, shortName } = resolveAppNames(pwa.toko, "toko", branding.brandName);

  return {
    ...STATIC_METADATA,
    applicationName: name,
    icons: {
      icon: settings.faviconUrl ?? "/favicon.ico",
      // iOS mengabaikan ikon di manifest untuk pintasan layar utama dan HANYA
      // membaca apple-touch-icon, jadi tanpa baris ini iPhone memasang app-nya
      // dengan tangkapan layar halaman sebagai ikon.
      apple: resolveIcon(pwa.toko, "toko").any,
    },
    appleWebApp: {
      capable: true,
      title: shortName,
      // "default" (bukan "black-translucent") DISENGAJA. Gaya translucent
      // menaikkan konten ke belakang notch, dan itu menuntut penanganan
      // safe-area di AdminShell yang mengunci tinggi layar dengan h-dvh.
      // Dengan "default", iOS menyisakan ruang untuk bilah statusnya sendiri
      // dan tata letak yang sudah ada tidak perlu diubah sama sekali.
      statusBarStyle: "default",
    },
  };
}

// Warna bilah status saat app berjalan standalone. Dibaca dari pengaturan
// supaya satu tempat (panel Aplikasi Mobile) mengatur warna di manifest DAN di
// meta tag sekaligus - dua sumber yang berbeda akan terlihat sebagai kedipan
// warna saat app dibuka.
export async function generateViewport(): Promise<Viewport> {
  const pwa = await getPwaSettings();
  return { themeColor: pwa.themeColor };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${baloo2.variable} h-full antialiased`}
    >
      <head>
        {/* Variabel tema disuntikkan di <head> supaya sudah berlaku pada cat
            pertama - kalau di <body>, halaman sempat berkedip memakai warna
            bawaan lebih dulu sebelum warna toko masuk. */}
        <StorefrontTheme />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {/* Dipasang di layout ROOT, bukan di layout admin: toast dipakai
              panel admin, portal mitra, dan storefront (mis. konfirmasi beli
              tier di /membership). Satu pemasangan menutup ketiganya. */}
          <ToastProvider>
            <QueryProvider>{children}</QueryProvider>
          </ToastProvider>
          {/* Mendaftarkan service worker. Di layout ROOT supaya berlaku di
              storefront, panel admin, dan portal mitra sekaligus - satu
              pendaftaran menutup ketiganya, sama seperti ToastProvider. */}
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
