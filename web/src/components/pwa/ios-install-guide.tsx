"use client";

import { Share, SquarePlus } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold">
        {n}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
    </li>
  );
}

/**
 * Panduan pemasangan untuk Safari iOS.
 *
 * iOS tidak menyediakan API pemasangan sama sekali — tidak ada padanan
 * `beforeinstallprompt` di WebKit — jadi satu-satunya yang bisa dilakukan
 * situs adalah menunjukkan jalannya lewat menu Bagikan.
 */
export function IosInstallGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Pasang di layar utama"
        description="iOS tidak mengizinkan situs memasang dirinya sendiri, jadi langkahnya lewat menu Safari."
      >
        <ol className="flex flex-col gap-3 text-sm">
          <Step n={1}>
            Ketuk tombol Bagikan
            <Share className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            di bilah bawah Safari.
          </Step>
          <Step n={2}>
            Gulir ke bawah, pilih
            <SquarePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <strong className="font-semibold">Tambahkan ke Layar Utama</strong>.
          </Step>
          <Step n={3}>
            Ketuk <strong className="font-semibold">Tambah</strong>. Ikonnya langsung muncul di layar
            utama.
          </Step>
        </ol>

        <p className="mt-4 rounded-lg bg-foreground/[0.04] px-3 py-2.5 text-xs text-muted-foreground">
          Setelah terpasang, kamu perlu login sekali lagi di dalam app. iOS memberi app yang dipasang
          penyimpanan sesi yang terpisah dari Safari — ini perilaku bawaan iOS, bukan gangguan.
        </p>
      </DialogContent>
    </Dialog>
  );
}
