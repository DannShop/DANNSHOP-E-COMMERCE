import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck, Wallet, Zap } from "lucide-react";
import { SiteLogo } from "@/components/site-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSiteSettings } from "@/lib/site-settings";

/**
 * Kerangka split-screen untuk SEMUA halaman auth (/login, /register,
 * /forgot-password, /reset-password). Panel brand di kiri identik di keempatnya;
 * yang berganti cuma judul dan isi form.
 *
 * Panel kiri disembunyikan total di bawah breakpoint lg - bukan ditumpuk di atas
 * form. Mayoritas pengunjung datang dari HP, dan gradient sebesar layar cuma
 * untuk hiasan itu beban yang tidak dibayar kembali di perangkat lemah.
 */

const TRUST_POINTS = [
  {
    icon: Zap,
    title: "Otomatis 24 jam",
    description: "Pesanan diproses mesin, bukan admin. Masuk dalam hitungan detik.",
  },
  {
    icon: Wallet,
    title: "Harga khusus member",
    description: "Sebagian produk lebih murah begitu kamu login. Tanpa kode, tanpa kupon.",
  },
  {
    icon: ShieldCheck,
    title: "Pembayaran aman",
    description: "QRIS, Virtual Account, dan Mandiri Bill — semua terverifikasi otomatis.",
  },
];

/** Berkas statis di public/payment-logos. Sengaja tidak diambil dari database:
 *  halaman login tidak boleh punya alasan tambahan untuk gagal atau melambat. */
const PAYMENT_LOGOS = [
  { file: "qris", label: "QRIS" },
  { file: "bca", label: "BCA" },
  { file: "bni", label: "BNI" },
  { file: "bri", label: "BRI" },
  { file: "mandiri", label: "Mandiri" },
  { file: "permata", label: "Permata" },
  { file: "cimb-niaga", label: "CIMB Niaga" },
];

export async function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Baris tautan di bawah form, mis. "Belum punya akun? Daftar". */
  footer?: ReactNode;
}) {
  const settings = await getSiteSettings();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ===== Panel brand (desktop saja) ===== */}
      <aside className="auth-brand relative hidden flex-col justify-between overflow-hidden border-r border-border/60 p-10 lg:flex xl:p-14">
        <Link href="/" className="w-fit">
          <SiteLogo
            logoUrl={settings.logoUrl}
            logoType={settings.logoType}
            className="h-9 max-w-40"
            fallbackClassName="text-xl"
          />
        </Link>

        <div className="max-w-md">
          <p className="font-heading text-[2rem] leading-tight font-bold tracking-tight xl:text-[2.25rem]">
            Topup game &amp; PPOB,
            <br />
            selesai dalam hitungan detik.
          </p>

          <ul className="mt-9 flex flex-col gap-6">
            {TRUST_POINTS.map(({ icon: Icon, title: pointTitle, description: pointDescription }) => (
              <li key={pointTitle} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{pointTitle}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {pointDescription}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Metode pembayaran
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {PAYMENT_LOGOS.map(({ file, label }) => (
              // Logo bank berwarna penuh dan sebagian besar gelap, jadi selalu
              // dialasi keping putih - kalau tidak, di tema gelap logo BCA/BNI
              // praktis hilang ke latar.
              <span
                key={file}
                className="grid h-9 w-16 place-items-center rounded-lg bg-white px-2.5 shadow-sm ring-1 ring-black/5"
              >
                {/* unoptimized WAJIB di sini. Optimizer gambar Next menolak SVG
                    kecuali dangerouslyAllowSVG dinyalakan di next.config.ts, dan
                    kita sengaja tidak menyalakannya. Lagipula SVG sudah vektor -
                    tidak ada yang bisa dioptimalkan. Dengan flag ini berkasnya
                    disajikan apa adanya dari /public. */}
                <Image
                  src={`/payment-logos/${file}.svg`}
                  alt={label}
                  width={56}
                  height={20}
                  unoptimized
                  className="max-h-4.5 w-auto object-contain"
                />
              </span>
            ))}
          </div>
        </div>
      </aside>

      {/* ===== Panel form ===== */}
      <main className="flex flex-col bg-background px-5 py-7 sm:px-8">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <Link href="/" className="lg:hidden">
            <SiteLogo
              logoUrl={settings.logoUrl}
              logoType={settings.logoType}
              className="h-7 max-w-28"
              fallbackClassName="text-base"
            />
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="font-heading text-[1.625rem] leading-tight font-bold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            )}

            <div className="mt-8">{children}</div>

            {footer && <p className="mt-7 text-sm text-muted-foreground">{footer}</p>}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/syarat-ketentuan" className="transition-colors hover:text-foreground">
            Syarat &amp; Ketentuan
          </Link>
          <span className="px-2 text-border">·</span>
          <Link href="/kebijakan-privasi" className="transition-colors hover:text-foreground">
            Kebijakan Privasi
          </Link>
        </p>
      </main>
    </div>
  );
}
