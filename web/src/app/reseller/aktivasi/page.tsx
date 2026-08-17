import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { AuthLayout } from "@/components/auth/auth-layout";
import { cn } from "@/lib/utils";
import { ActivateResellerForm } from "./activate-form";

export const metadata: Metadata = { title: "Aktivasi Akun Reseller" };

// Halaman PUBLIK, dengan alasan yang sama persis seperti /konfirmasi-email:
// link-nya dibuka dari inbox, sering di HP atau browser lain yang belum pernah
// login - dan untuk pendaftar dari form publik, akunnya memang belum pernah
// dipakai login sama sekali. Kalau halaman ini menuntut sesi, pendaftar baru
// terjebak: harus login untuk aktivasi, padahal aktivasi yang membuka akunnya.
// Tokenlah kredensialnya di sini.
//
// ⚠️ Route ini WAJIB dikecualikan dari rewrite maintenance di proxy.ts, sekelas
// /konfirmasi-email dan /reset-password: link-nya masuk lewat email, berumur 30
// menit, dan sekali pakai. Orang yang membukanya saat toko kebetulan sedang
// maintenance akan melihat halaman maintenance, mengira link-nya rusak, dan
// tokennya keburu mati sebelum toko dibuka lagi.
export default async function ResellerActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";

  if (!token) {
    return (
      <AuthLayout
        title="Link tidak valid"
        description="Link aktivasi ini tidak lengkap. Buka menu Reseller di akunmu untuk meminta link baru."
      >
        <Link href="/login" className={cn(buttonVariants(), "h-11 w-full rounded-xl text-[0.9375rem]")}>
          Ke Halaman Masuk
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Aktifkan akun reseller"
      description="Klik tombol di bawah untuk menyelesaikan pendaftaranmu. Setelah aktif, kamu langsung bisa bertransaksi — harga masih normal di paket gratis, dan bisa diturunkan kapan saja dengan mengambil paket berbayar."
    >
      <ActivateResellerForm token={token} />
    </AuthLayout>
  );
}
