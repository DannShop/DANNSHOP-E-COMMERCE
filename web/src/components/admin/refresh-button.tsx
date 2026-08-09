"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Memuat ulang DATA halaman tanpa memuat ulang seluruh browser.
//
// router.refresh() menjalankan ulang Server Component-nya dan menambal hasilnya
// ke halaman yang sedang tampil. Bedanya dengan menekan F5: posisi scroll,
// isian form, dan state komponen klien (tab yang sedang dibuka, dropdown)
// semuanya bertahan - persis yang hilang tiap kali admin menekan refresh
// browser cuma untuk melihat apakah ada order baru masuk.
export function RefreshButton({ label = "Refresh", className }: { label?: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      aria-live="polite"
    >
      <RotateCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
      {pending ? "Memuat..." : label}
    </Button>
  );
}
