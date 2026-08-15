"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { useInstallPrompt } from "@/components/pwa/use-install-prompt";
import { IosInstallGuide } from "@/components/pwa/ios-install-guide";

/**
 * Ajakan memasang toko ke layar utama, di halaman Akun Saya.
 *
 * Memakai hook yang SAMA dengan InstallButton, bukan deteksinya sendiri —
 * kalau tidak, bingkai kartunya bisa tetap tampil mengelilingi tombol yang
 * memutuskan untuk tidak merender apa pun.
 */
export function InstallAppCard() {
  const { available, needsManualGuide, promptInstall } = useInstallPrompt();
  const [showGuide, setShowGuide] = useState(false);

  if (!available) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (needsManualGuide ? setShowGuide(true) : void promptInstall())}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-5 py-4 text-left transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Smartphone className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Pasang di layar utama</span>
            <span className="block text-xs text-muted-foreground">
              Buka toko langsung dari ikon di HP, tanpa buka browser dulu.
            </span>
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-primary">Pasang</span>
      </button>

      <IosInstallGuide open={showGuide} onOpenChange={setShowGuide} />
    </>
  );
}
