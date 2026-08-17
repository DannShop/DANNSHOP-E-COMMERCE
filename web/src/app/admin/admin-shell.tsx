"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Menu, Sun, Moon, ChevronRight, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { withThemeTransition } from "@/lib/theme-transition";
import { RefreshButton } from "@/components/admin/refresh-button";
import { InstallButton } from "@/components/pwa/install-button";
import { AdminSidebar } from "./admin-sidebar";
import type { Permission } from "@/lib/rbac/permissions";
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
  permissions,
  logoUrl,
  logoType,
  faviconUrl,
  needsTwoFactor = false,
}: {
  children: React.ReactNode;
  userEmail: string;
  userRole: string;
  /** Izin karyawan; dipakai HANYA untuk menyembunyikan menu. Penegakannya di proxy.ts. */
  permissions: Permission[];
  /** true = akun ini belum memasang 2FA; spanduk peringatan ditampilkan. */
  needsTwoFactor?: boolean;
  /** Logo situs dari Admin > Pengaturan Situs - sumber yang sama dengan storefront. */
  logoUrl: string | null;
  logoType: "image" | "video";
  /** Favicon situs (selalu persegi) - dipakai sebagai mark saat sidebar diciutkan. */
  faviconUrl: string | null;
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

  // Kunci scroll DOKUMEN (html/body), bukan cuma elemen React di bawah.
  // Tanpa ini, h-dvh + overflow-hidden pada .admin-shell di bawah hanya
  // mengunci elemennya sendiri - html/body tetap technically bisa scroll
  // (globals.css cuma menyembunyikan scrollbar-nya lewat scrollbar-width:none,
  // bukan mematikan overflow-nya, karena storefront & /account SENGAJA
  // memakai scroll dokumen natural, bukan bug). Kalau html/body punya sisa
  // tinggi scroll walau 1px (pembulatan dvh, atau browser menggeser dokumen
  // supaya elemen yang baru fokus "terlihat" - persis yang terjadi saat
  // checkbox di-toggle), seluruh shell h-dvh ini ikut terangkat dan
  // menyingkap background polos di baliknya. Efeknya kentara pas di-scroll
  // sampai mentok karena di situ tidak ada lagi ruang scroll di dalam <main>
  // yang bisa "menyerap" gesernya - geseran itu lolos ke dokumen.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // overscroll-behavior: none mematikan efek "mental" (rubber-band) di level
    // dokumen. overflow:hidden saja tidak cukup: sebagian browser tetap
    // memantulkan seluruh dokumen saat di-scroll melewati batas, dan pantulan
    // itulah yang menyingkap <body> putih polos di balik .admin-shell (shell
    // punya gradient sendiri, body tidak - makanya kelihatan sebagai "layar
    // naik jadi putih"). Sengaja dipasang lewat JS di sini, BUKAN di
    // globals.css: kalau global, pull-to-refresh di storefront ikut mati.
    html.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
    };
  }, []);

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
          permissions={permissions}
          logoUrl={logoUrl}
          logoType={logoType}
          faviconUrl={faviconUrl}
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
          permissions={permissions}
          logoUrl={logoUrl}
          logoType={logoType}
          faviconUrl={faviconUrl}
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
            {/* Merender null sendiri kalau panel ini sudah dibuka dari app yang
                terpasang, atau kalau browsernya tidak bisa memasang apa pun -
                jadi tidak perlu dikondisikan dari sini. Teksnya disembunyikan di
                layar sempit; ikonnya saja sudah cukup di header yang padat. */}
            <InstallButton
              label="Install app"
              className="h-9 gap-1.5 px-2.5 text-xs [&>span]:hidden sm:[&>span]:inline"
            />
            <RefreshButton />
            <ThemeSwitch />
          </div>
        </header>

        {/* Satu-satunya elemen yang scroll di seluruh panel admin. overscroll-contain
            mencegah scroll "merambat" ke dokumen begitu mentok - lapisan kedua di
            samping scroll-lock html/body di atas, buat mekanisme trackpad/mobile
            rubber-band yang beda dari kasus focus-scroll yang dikunci useEffect. */}
        {/* `relative` di sini BUKAN kosmetik - ini yang benar-benar memperbaiki
            "browser keangkat pas centang checkbox".
            Checkbox Base UI merender <input> tersembunyi ber-`position:absolute`
            tanpa top/left. Tanpa satu pun leluhur ber-`position`, containing
            block input itu jadi initial containing block (dokumen), BUKAN
            <main> ini - artinya dia lolos dari overflow <main>. Saat diklik,
            browser men-scroll-into-view input tsb dan yang tergeser jadi
            DOKUMEN-nya. `overflow:hidden` tidak menahan ini: dia cuma memblok
            scroll oleh USER, bukan scroll-into-view otomatis dari fokus.
            Dengan `relative`, <main> jadi containing block-nya, sehingga yang
            tergeser <main> (memang boleh scroll) bukan seluruh shell. */}
        <main className="no-scrollbar relative flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {/* Peringatan 2FA. Ditampilkan DI SINI, bukan lewat pengalihan paksa,
              karena komponen ini tahu pathname-nya sendiri (usePathname) —
              sementara layout di server tidak, dan pengalihan yang menebak-nebak
              posisi bisa mengalihkan halaman tujuan ke dirinya sendiri lalu
              mengunci admin dari seluruh panel. */}
          {needsTwoFactor && !pathname.startsWith("/admin/keamanan") && (
            <Link
              href="/admin/keamanan"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm transition-colors hover:bg-amber-500/15"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>
                <strong>Akun admin ini belum memakai 2FA.</strong> Satu password yang bocor sudah cukup untuk
                mengambil alih kunci pembayaran dan kredensial provider — pasang sekarang.
              </span>
            </Link>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
