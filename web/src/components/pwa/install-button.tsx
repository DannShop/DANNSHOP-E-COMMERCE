"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstallPrompt } from "@/components/pwa/use-install-prompt";
import { IosInstallGuide } from "@/components/pwa/ios-install-guide";

/**
 * Tombol "Install aplikasi".
 *
 * Merender null sendiri kalau app sudah terpasang atau browsernya tidak bisa
 * memasang apa pun, jadi pemakainya tidak perlu mengondisikan apa-apa. Di
 * Safari iOS tombolnya membuka panduan manual, karena WebKit tidak menyediakan
 * API pemasangan sama sekali.
 */
export function InstallButton({
  className,
  label = "Install aplikasi",
}: {
  className?: string;
  label?: string;
}) {
  const { available, needsManualGuide, promptInstall } = useInstallPrompt();
  const [showGuide, setShowGuide] = useState(false);

  if (!available) return null;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => (needsManualGuide ? setShowGuide(true) : void promptInstall())}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-border/60 bg-foreground/[0.04] px-3 py-2 text-sm font-medium",
          "transition-colors duration-200 ease-out hover:bg-foreground/[0.08]",
          className,
        )}
      >
        <Download className="size-4 shrink-0" aria-hidden="true" />
        {/* Label dibungkus <span> supaya pemakainya bisa menyembunyikan teksnya
            di layar sempit (mis. header admin) dan menyisakan ikonnya saja. */}
        <span>{label}</span>
      </button>

      <IosInstallGuide open={showGuide} onOpenChange={setShowGuide} />
    </>
  );
}
