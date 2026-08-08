"use client";

import Link from "next/link";
import { Tooltip } from "@base-ui/react/tooltip";
import { PanelLeftClose, PanelLeftOpen, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { SiteLogo } from "@/components/site-logo";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, isNavItemActive } from "./nav-config";

export function AdminSidebar({
  pathname,
  collapsed,
  onToggleCollapse,
  onNavigate,
  userEmail,
  userRole,
  logoUrl,
  logoType,
  faviconUrl,
}: {
  pathname: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Dipanggil tiap klik menu - dipakai varian mobile untuk menutup drawer. */
  onNavigate?: () => void;
  userEmail: string;
  userRole: string;
  /** Logo yang diunggah admin di Pengaturan Situs; null = belum pernah diisi. */
  logoUrl: string | null;
  logoType: "image" | "video";
  /** Favicon situs (dipaksa persegi saat diunggah); null = belum pernah diisi. */
  faviconUrl: string | null;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* ===== Brand ===== */}
      {/* Sumbernya sama persis dengan navbar storefront & halaman auth (SiteLogo
          + logo_url/logo_type dari Pengaturan Situs), supaya panel admin tidak
          jadi satu-satunya tempat yang punya brand sendiri.

          Logo situs berformat melebar (~10:3), jadi hanya dipakai saat sidebar
          melebar. Dalam keadaan diciutkan lebarnya cuma 4,75rem - di situ yang
          tampil favicon situs, yang memang sudah dipaksa persegi saat diunggah.
          Kalau admin belum pernah mengunggah logo/favicon, tampilannya persis
          seperti sebelumnya (mark gradient "D" + wordmark DANNSHOP). */}
      <div
        className={cn(
          // `relative` wajib: wordmark di bawah jadi `absolute` saat diciutkan.
          // Tanpa ini containing block-nya lari ke dokumen - kelas bug yang
          // sama persis dengan yang dijelaskan di admin-shell.tsx soal <main>.
          "relative flex h-16 shrink-0 items-center gap-3 px-4",
          collapsed && "justify-center px-0",
        )}
      >
        {logoUrl && !collapsed ? (
          <SiteLogo logoUrl={logoUrl} logoType={logoType} className="h-8 max-w-[11.5rem]" />
        ) : (
          <>
            {collapsed && faviconUrl ? (
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-foreground/[0.04]">
                {/* eslint-disable-next-line @next/next/no-img-element -- URL upload arbitrer dari admin, tanpa domain whitelist di next.config */}
                <img src={faviconUrl} alt="" className="size-full object-contain" />
              </span>
            ) : (
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-heading text-base font-bold text-white shadow-lg shadow-indigo-500/25">
                D
              </span>
            )}
            <span
              className={cn(
                "flex min-w-0 flex-col overflow-hidden transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                collapsed && "pointer-events-none absolute -translate-x-2 opacity-0",
              )}
            >
              <span className="truncate font-heading text-sm leading-tight font-bold tracking-tight">
                DANNSHOP
              </span>
              <span className="truncate text-[10px] leading-tight font-medium tracking-[0.18em] text-muted-foreground">
                DIGITAL
              </span>
            </span>
          </>
        )}
      </div>

      {/* ===== Menu ===== */}
      {/* no-scrollbar + overflow-y-auto: daftar menu tetap bisa di-scroll di
          layar pendek. Dulu itu jadi alasan label saat menciut memakai atribut
          `title` bawaan browser - tooltip kustom biasa PASTI terpotong container
          ini. Sekarang dipakai Tooltip Base UI yang mem-PORTAL popup-nya ke
          <body>, jadi overflow di sini tidak menyentuhnya sama sekali.
          Aksesibilitas tidak berkurang: label aslinya tetap ada di DOM (cuma
          opacity-0) sebagai nama link untuk screen reader, dan Base UI
          menambahkan aria-describedby ke tooltipnya.

          Provider membungkus seluruh daftar supaya delay-nya BERSAMA: begitu
          satu tooltip terbuka, pindah ke item lain langsung tampil tanpa
          menunggu ulang - persis perilaku menu di macOS. */}
      <Tooltip.Provider delay={350} closeDelay={0}>
        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label || "root"} className={cn(groupIndex > 0 && "mt-5")}>
              {group.label &&
                (collapsed ? (
                  <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
                ) : (
                  <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground/80 uppercase">
                    {group.label}
                  </p>
                ))}

              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      {/* Dimatikan saat sidebar melebar - labelnya sudah terbaca
                          di menu, tooltip cuma jadi gangguan. Pakai `disabled`,
                          bukan render bersyarat, supaya <Link>-nya tidak
                          di-remount tiap sidebar diciutkan/dilebarkan. */}
                      <Tooltip.Root disabled={!collapsed}>
                        <Tooltip.Trigger
                          render={
                            <Link
                              href={item.href}
                              onClick={onNavigate}
                              aria-current={active ? "page" : undefined}
                              className={cn(
                                "group/item relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                                "transition-[background-color,color,box-shadow] duration-200 ease-out",
                                collapsed && "justify-center px-0",
                                active
                                  ? "bg-gradient-to-r from-indigo-500/90 to-violet-500/90 text-white shadow-md shadow-indigo-500/20"
                                  : "text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground",
                              )}
                            >
                              <item.icon
                                className={cn("size-[18px] shrink-0", !active && "text-muted-foreground")}
                                aria-hidden="true"
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                                  collapsed && "pointer-events-none absolute -translate-x-2 opacity-0",
                                )}
                              >
                                {item.label}
                              </span>
                            </Link>
                          }
                        />
                        <Tooltip.Portal>
                          <Tooltip.Positioner side="right" sideOffset={10} className="z-50">
                            <Tooltip.Popup
                              className={cn(
                                "glass-tooltip rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-foreground",
                                "transition-[opacity,transform] duration-150 ease-out",
                                "data-[starting-style]:-translate-x-1 data-[starting-style]:opacity-0",
                                "data-[ending-style]:-translate-x-1 data-[ending-style]:opacity-0",
                                // data-instant dipasang Base UI saat tooltip berpindah
                                // antar item dalam satu grup - di situ animasi masuk
                                // justru terasa lamban, bukan halus.
                                "data-instant:duration-0",
                                "motion-reduce:transition-none",
                              )}
                            >
                              {item.label}
                            </Tooltip.Popup>
                          </Tooltip.Positioner>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </Tooltip.Provider>

      {/* ===== Footer: identitas + keluar + tombol collapse ===== */}
      <div className="shrink-0 border-t border-border/60 p-3">
        <div
          className={cn(
            "relative mb-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-xs font-semibold uppercase">
            {userEmail.slice(0, 2)}
          </span>
          <span
            className={cn(
              "flex min-w-0 flex-col overflow-hidden transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              collapsed && "pointer-events-none absolute -translate-x-2 opacity-0",
            )}
          >
            <span className="truncate text-xs font-medium">{userEmail}</span>
            <span className="truncate text-[10px] text-muted-foreground">{userRole}</span>
          </span>
        </div>

        <div className={cn("flex items-center gap-1.5", collapsed && "flex-col")}>
          <form action={logoutAction} className={cn(!collapsed && "flex-1")}>
            <button
              type="submit"
              title={collapsed ? "Keluar" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground",
                "transition-colors duration-200 ease-out hover:bg-destructive/10 hover:text-destructive",
                collapsed && "justify-center px-0",
              )}
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && "Keluar"}
            </button>
          </form>

          {/* Tombol minimize disembunyikan di mobile - di sana sidebar berupa
              drawer, tombolnya ada di header (hamburger), bukan di sini. */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Perlebar sidebar" : "Perkecil sidebar"}
            aria-label={collapsed ? "Perlebar sidebar" : "Perkecil sidebar"}
            className="hidden shrink-0 rounded-lg p-2 text-muted-foreground transition-colors duration-200 ease-out hover:bg-foreground/[0.06] hover:text-foreground md:block"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
