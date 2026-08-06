"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, Sun, Moon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { withThemeTransition } from "@/lib/theme-transition";
import { AdminSidebar } from "./admin-sidebar";
import { resolvePageTitle } from "./nav-config";

const COLLAPSE_STORAGE_KEY = "dannshop.admin.sidebarCollapsed";

function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- pola resmi next-themes untuk hindari hydration mismatch (sama seperti components/theme-toggle.tsx)
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      disabled={!mounted}
      onClick={() => withThemeTransition(() => setTheme(isDark ? "light" : "dark"))}
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      className="grid size-9 place-items-center rounded-xl border border-border/60 bg-foreground/[0.04] text-muted-foreground transition-[background-color,color,transform] duration-200 ease-out hover:bg-foreground/[0.08] hover:text-foreground active:scale-95 disabled:opacity-0"
    >
      {mounted && (isDark ? <Sun className="size-4" /> : <Moon className="size-4" />)}
    </button>
  );
}

export function AdminShell({
  children,
  userEmail,
  userRole,
}: {
  children: React.ReactNode;
  userEmail: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Preferensi lebar sidebar dibaca setelah mount (bukan saat render pertama)
  // supaya HTML server & client identik - kalau dibaca langsung di useState,
  // hasil server (selalu false) beda dengan client dan memicu hydration error.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage hanya bisa di client, pola yang sama dipakai ThemeSwitch di atas
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1");
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  // Drawer mobile ditutup tiap pindah halaman - termasuk saat navigasi lewat
  // tombol back/forward browser, yang tidak tertangkap oleh onNavigate.
  // Pola "menyesuaikan state saat render" (bukan useEffect) sesuai anjuran
  // resmi React untuk mereset state ketika sebuah nilai berubah:
  // https://react.dev/learn/you-might-not-need-an-effect
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const pageTitle = resolvePageTitle(pathname);

  return (
    // h-dvh + overflow-hidden di pembungkus = tinggi layar dikunci; yang
    // benar-benar scroll cuma <main> di dalamnya. Inilah yang bikin sidebar
    // & header tidak pernah ikut bergeser saat konten panjang di-scroll.
    <div className="admin-shell flex h-dvh overflow-hidden">
      {/* ===== Sidebar desktop (inline, bisa diciutkan) ===== */}
      <aside
        className={cn(
          "glass-panel z-30 hidden shrink-0 border-y-0 border-l-0 md:block",
          "transition-[width] duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          collapsed ? "w-[4.75rem]" : "w-64",
        )}
      >
        <AdminSidebar
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          userEmail={userEmail}
          userRole={userRole}
        />
      </aside>

      {/* ===== Sidebar mobile (drawer overlay) ===== */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        className={cn(
          "glass-panel fixed inset-y-0 left-0 z-50 w-64 border-y-0 border-l-0 md:hidden",
          "transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <AdminSidebar
          pathname={pathname}
          collapsed={false}
          onToggleCollapse={toggleCollapse}
          onNavigate={() => setMobileOpen(false)}
          userEmail={userEmail}
          userRole={userRole}
        />
      </aside>

      {/* ===== Area konten ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel z-20 flex h-16 shrink-0 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-foreground/[0.04] text-muted-foreground transition-colors duration-200 ease-out hover:bg-foreground/[0.08] hover:text-foreground md:hidden"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="hidden text-sm text-muted-foreground sm:inline">Admin</span>
            <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden="true" />
            <h1 className="truncate font-heading text-base font-bold tracking-tight sm:text-lg">
              {pageTitle}
            </h1>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeSwitch />
          </div>
        </header>

        {/* Satu-satunya elemen yang scroll di seluruh panel admin. */}
        <main className="no-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
