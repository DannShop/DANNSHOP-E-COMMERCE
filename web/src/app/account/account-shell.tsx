"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Store } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { ACCOUNT_NAV, ACCOUNT_NAV_GRID_CLASS, isAccountNavActive, resolveAccountPageTitle } from "./nav-config";

/**
 * Kerangka panel user.
 *
 * Bahasanya sama dengan panel admin (material kaca, radius, kurva easing), tapi
 * KELAKUANNYA sengaja berbeda:
 *
 *  - Tidak ada tombol ciutkan sidebar. Admin butuh itu karena menunya 13 dan
 *    layarnya penuh tabel lebar; user cuma punya lima menu.
 *  - Di HP memakai tab bar, bukan drawer hamburger. Drawer selalu menuntut dua
 *    ketukan untuk pindah halaman, dan mayoritas pengunjung PPOB datang dari HP.
 *  - Halaman ikut menggulung secara alami (admin mengunci tinggi layar).
 *    Untuk daftar riwayat yang bisa panjang, gulir alami terasa jauh lebih wajar
 *    di HP - termasuk sembunyi-munculnya bilah alamat browser.
 */
export function AccountShell({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const pageTitle = resolveAccountPageTitle(pathname);

  return (
    <div className="account-shell flex min-h-dvh">
      {/* ===== Sidebar desktop ===== */}
      <aside className="glass-panel sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-y-0 border-l-0 md:flex">
        <Link
          href="/"
          className="flex h-16 shrink-0 items-center gap-3 px-4 transition-opacity hover:opacity-80"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-heading text-base font-bold text-white shadow-lg shadow-indigo-500/25">
            D
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-heading text-sm leading-tight font-bold tracking-tight">
              DANNSHOP
            </span>
            <span className="truncate text-[10px] leading-tight font-medium tracking-[0.18em] text-muted-foreground">
              DIGITAL
            </span>
          </span>
        </Link>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          <ul className="flex flex-col gap-0.5">
            {ACCOUNT_NAV.map((item) => {
              const active = isAccountNavActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                      "transition-[background-color,color,box-shadow] duration-200 ease-out",
                      active
                        ? "bg-gradient-to-r from-indigo-500/90 to-violet-500/90 text-white shadow-md shadow-indigo-500/20"
                        : "text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
                    )}
                  >
                    <item.icon
                      className={cn("size-[18px] shrink-0", !active && "text-muted-foreground")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-border/60 p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold uppercase">
              {userName.slice(0, 2)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium">{userName}</span>
              <span className="truncate text-[10px] text-muted-foreground">{userEmail}</span>
            </span>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Keluar
            </button>
          </form>
        </div>
      </aside>

      {/* ===== Area konten ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-x-0 border-t-0 px-4 sm:px-6">
          <h1 className="min-w-0 truncate font-heading text-base font-bold tracking-tight sm:text-lg">
            {pageTitle}
          </h1>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Jalan pulang ke toko, TERLIHAT DI SEMUA UKURAN LAYAR.
                Sebelumnya cuma muncul di HP dengan asumsi blok brand di puncak
                sidebar sudah cukup untuk desktop - tapi logo yang kebetulan
                bisa diklik bukan tombol: tidak ada yang menandainya sebagai
                jalan keluar, dan orang memang tidak menemukannya. Di layar
                lebar labelnya ikut tampil supaya tujuannya terbaca, bukan
                ditebak dari ikon. */}
            <Link
              href="/"
              aria-label="Kembali ke toko"
              className="flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-foreground/[0.04] px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-foreground/[0.08] hover:text-foreground"
            >
              <Store className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Ke Toko</span>
            </Link>
            <ThemeToggle className="size-9 rounded-xl" />
          </div>
        </header>

        {/* pb-28 di HP menyisakan ruang untuk tab bar yang melayang di bawah;
            tanpa ini, baris terakhir daftar riwayat selalu tertutup. */}
        <main className="flex-1 p-4 pb-28 sm:p-6 md:pb-6">{children}</main>
      </div>

      {/* ===== Tab bar mobile ===== */}
      <nav
        aria-label="Menu akun"
        className="glass-panel fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className={cn("grid", ACCOUNT_NAV_GRID_CLASS)}>
          {ACCOUNT_NAV.map((item) => {
            const active = isAccountNavActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 px-0.5",
                    "transition-colors duration-200 ease-out",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="w-full truncate text-center text-[10px] leading-none font-medium">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
