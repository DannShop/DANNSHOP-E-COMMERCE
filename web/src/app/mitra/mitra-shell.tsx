"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Store, User } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MITRA_NAV, isMitraNavActive, resolveMitraPage } from "./nav-config";

/**
 * Kerangka portal mitra.
 *
 * Bahasa visualnya sama dengan panel user & admin (material kaca, radius, kurva
 * easing) supaya tidak terasa seperti aplikasi lain, tapi navigasinya berbeda
 * dari keduanya dan itu disengaja:
 *
 *  - Panel user memakai tab bar 6 kolom di HP. Portal ini punya 7 menu; dipaksa
 *    jadi tab bar, labelnya tidak lagi terbaca di layar 360px. Di sini menunya
 *    jadi baris segmen yang bisa digulir mendatar — pola yang sama dipakai
 *    dashboard developer pada umumnya, dan menampung berapa pun menu tanpa
 *    pernah menggencet teks.
 *  - Halaman ikut menggulung alami (admin mengunci tinggi layar). Riwayat
 *    transaksi dan dokumentasi API sama-sama panjang; mengunci tinggi di sini
 *    cuma menghasilkan dua area gulir yang saling berebut.
 */
export function MitraShell({
  children,
  userName,
  username,
  isActive,
}: {
  children: React.ReactNode;
  userName: string;
  username: string;
  isActive: boolean;
}) {
  const pathname = usePathname();
  const page = resolveMitraPage(pathname);

  return (
    <div className="account-shell flex min-h-dvh">
      {/* ===== Sidebar desktop ===== */}
      <aside className="glass-panel sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-y-0 border-l-0 md:flex">
        <Link href="/mitra" className="flex h-16 shrink-0 items-center gap-3 px-4 transition-opacity hover:opacity-80">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-heading text-base font-bold text-white shadow-lg shadow-indigo-500/25">
            D
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-heading text-sm leading-tight font-bold tracking-tight">DANNSHOP</span>
            <span className="truncate text-[10px] leading-tight font-medium tracking-[0.18em] text-muted-foreground">
              PORTAL MITRA
            </span>
          </span>
        </Link>

        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          <ul className="flex flex-col gap-0.5">
            {MITRA_NAV.map((item) => {
              const active = isMitraNavActive(pathname, item.href);
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
              <span className="truncate font-mono text-[10px] text-muted-foreground">{username}</span>
            </span>
          </div>

          <Link
            href="/account"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <User className="size-4 shrink-0" aria-hidden="true" />
            Panel Akun
          </Link>
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
        <header className="glass-panel sticky top-0 z-20 flex shrink-0 flex-col border-x-0 border-t-0">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate font-heading text-base font-bold tracking-tight sm:text-lg">{page.label}</h1>
              <p className="truncate text-[11px] text-muted-foreground">{page.hint}</p>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {!isActive && <Badge variant="destructive">Nonaktif</Badge>}
              <Link
                href="/"
                aria-label="Kembali ke toko"
                className="grid size-9 place-items-center rounded-xl border border-border/60 bg-foreground/[0.04] text-muted-foreground transition-colors duration-200 ease-out hover:bg-foreground/[0.08] hover:text-foreground md:hidden"
              >
                <Store className="size-4" aria-hidden="true" />
              </Link>
              <ThemeToggle className="size-9 rounded-xl" />
            </div>
          </div>

          {/* Menu mendatar khusus HP. `no-scrollbar` + snap membuatnya terasa
              seperti segmen, bukan seperti daftar yang kebetulan meluber. */}
          <nav aria-label="Menu mitra" className="no-scrollbar overflow-x-auto border-t border-border/60 md:hidden">
            <ul className="flex w-max gap-1 px-3 py-2">
              {MITRA_NAV.map((item) => {
                const active = isMitraNavActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                        "transition-colors duration-200 ease-out",
                        active
                          ? "bg-gradient-to-r from-indigo-500/90 to-violet-500/90 text-white"
                          : "text-muted-foreground hover:bg-foreground/[0.06]",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
