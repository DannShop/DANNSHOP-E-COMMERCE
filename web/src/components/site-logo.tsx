import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo situs yang diunggah admin lewat /admin/settings.
 *
 * Diekstrak jadi komponen sendiri karena logo bisa berupa VIDEO, bukan cuma
 * gambar - cabang itu gampang kelewat kalau tiap tempat menulis ulang sendiri.
 * Dipakai di site-header dan halaman auth.
 *
 * `unoptimized` disengaja: sumbernya URL upload yang bisa berganti kapan saja
 * dan bukan domain yang terdaftar di next.config, jadi optimizer Next dilewati.
 */
export function SiteLogo({
  logoUrl,
  logoType,
  className,
  fallbackClassName,
}: {
  logoUrl: string | null;
  logoType: "image" | "video";
  /** Kelas ukuran untuk logo gambar/video. Default setara header. */
  className?: string;
  /** Kelas teks untuk keadaan admin belum pernah mengunggah logo. */
  fallbackClassName?: string;
}) {
  if (!logoUrl) {
    return (
      <span className={cn("font-heading font-bold", fallbackClassName ?? "text-lg")}>
        DannShop
      </span>
    );
  }

  if (logoType === "video") {
    return (
      <video
        src={logoUrl}
        autoPlay
        loop
        muted
        playsInline
        className={cn("w-auto object-contain", className ?? "h-8 max-w-32")}
      />
    );
  }

  return (
    <Image
      src={logoUrl}
      alt="DannShop"
      width={120}
      height={32}
      unoptimized
      className={cn("w-auto object-contain", className ?? "h-8")}
    />
  );
}
