import type { Metadata } from "next";
import { Baloo_2, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ToastProvider } from "@/components/ui/toast";
import { getSiteSettings } from "@/lib/site-settings";
import { StorefrontTheme } from "@/components/storefront-theme";

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
// diisi, `icons` dibiarkan undefined sehingga Next.js jatuh balik ke
// app/favicon.ico bawaan.
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    ...STATIC_METADATA,
    ...(settings.faviconUrl ? { icons: { icon: settings.faviconUrl } } : {}),
  };
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
        </ThemeProvider>
      </body>
    </html>
  );
}
