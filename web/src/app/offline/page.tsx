import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Tidak ada koneksi" };

/**
 * Halaman cadangan saat perangkat sedang offline.
 *
 * SENGAJA STATIS TOTAL: tanpa query DB, tanpa state, tanpa tombol yang
 * memanggil apa pun. Halaman ini disimpan service worker saat dipasang dan
 * disajikan lagi entah berapa lama kemudian — mungkin beberapa deploy setelah
 * versi ini ditulis. Apa pun yang datanya bisa berubah akan tampil basi di
 * situ, jadi di sini tidak boleh ada data sama sekali.
 *
 * Tombol "Coba lagi" memakai <a href> biasa, bukan router Next: saat halaman
 * ini tampil, bundel JS-nya justru yang mungkin gagal dimuat.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-foreground/[0.06] text-muted-foreground">
        <WifiOff className="size-7" aria-hidden="true" />
      </span>

      <div className="space-y-2">
        <h1 className="font-heading text-xl font-bold tracking-tight">Tidak ada koneksi</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Perangkatmu sedang tidak tersambung ke internet. Transaksi yang sudah dibayar tetap
          diproses di server — tidak ada yang hilang. Sambungkan lagi, lalu muat ulang halaman ini.
        </p>
      </div>

      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- <Link> menavigasi lewat router di sisi klien, dan halaman ini justru tampil ketika bundel JS-nya yang mungkin gagal dimuat. Muat ulang penuh adalah satu-satunya yang pasti bekerja di sini. */}
      <a
        href="/"
        className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Coba lagi
      </a>
    </div>
  );
}
