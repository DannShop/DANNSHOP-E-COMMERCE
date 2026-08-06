"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withThemeTransition } from "@/lib/theme-transition";

/** `className` dipakai panel user supaya ukuran tombolnya sama dengan tombol
 *  lain di header panel (36px), sementara storefront tetap memakai ukuran
 *  bawaan. Diberikan sebagai prop, bukan komponen salinan. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- pola resmi next-themes untuk hindari hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Placeholder harus berukuran sama dengan tombol aslinya, kalau tidak
    // header bergeser sedikit begitu komponen ini selesai mount.
    return <Button variant="ghost" size="icon" className={className} disabled aria-hidden="true" />;
  }

  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => withThemeTransition(() => setTheme(isDark ? "light" : "dark"))}
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
