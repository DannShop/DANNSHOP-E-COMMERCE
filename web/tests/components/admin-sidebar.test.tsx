import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminSidebar } from "@/app/admin/admin-sidebar";
import { NAV_GROUPS, resolvePageTitle } from "@/app/admin/nav-config";

// logoutAction adalah Server Action; berkasnya menarik auth + Prisma begitu
// di-import, dan tidak satu pun dari itu relevan untuk memastikan menunya
// tampil. Yang diuji di sini bentuk sidebar-nya, bukan proses keluarnya.
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));

const PROPS = {
  pathname: "/admin",
  collapsed: false,
  onToggleCollapse: () => {},
  userEmail: "admin@dannshop.id",
  userRole: "ADMIN",
  logoUrl: null,
  logoType: "image" as const,
  faviconUrl: null,
};

/**
 * SMOKE TEST seluruh menu admin.
 *
 * Alasannya lahirnya konkret: sebuah komponen menu yang melempar saat render
 * pernah menjatuhkan seluruh halaman ke "This page couldn't load", dan `tsc`
 * maupun `npm run build` sama-sama lolos karena halaman admin dirender saat
 * request, bukan saat build. Selama tidak ada yang benar-benar MERENDER
 * komponennya dalam pemeriksaan otomatis, kelas bug itu hanya bisa ditemukan
 * oleh orang yang membuka halamannya.
 *
 * Tes ini merender daftar menu yang SEBENARNYA (NAV_GROUPS, bukan data palsu),
 * jadi menu yang ditambahkan besok ikut terperiksa tanpa berkas ini disentuh.
 */
describe("AdminSidebar", () => {
  it("merender setiap menu dari NAV_GROUPS", () => {
    render(<AdminSidebar {...PROPS} />);

    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        const link = screen.getByRole("link", { name: item.label });
        expect(link).toHaveAttribute("href", item.href);
      }
    }
  });

  it("merender setiap judul grup", () => {
    render(<AdminSidebar {...PROPS} />);

    for (const group of NAV_GROUPS.filter((g) => g.label)) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("menandai halaman yang sedang dibuka, dan hanya satu", () => {
    render(<AdminSidebar {...PROPS} pathname="/admin/products" />);

    const aktif = screen.getAllByRole("link", { current: "page" });
    expect(aktif).toHaveLength(1);
    expect(aktif[0]).toHaveAttribute("href", "/admin/products");
  });

  it("tidak ikut menyorot Dashboard di halaman lain", () => {
    // "/admin" adalah prefix SEMUA route admin - tanpa pencocokan persis,
    // Dashboard akan tersorot di mana pun.
    render(<AdminSidebar {...PROPS} pathname="/admin/orders/INV-123" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("tetap merender seluruh menu dalam keadaan diciutkan", () => {
    // Keadaan ciut mengubah tata letak cukup banyak (label jadi absolute,
    // tooltip Base UI dinyalakan). Labelnya harus tetap ada di DOM sebagai nama
    // tautan untuk pembaca layar, cuma disembunyikan secara visual.
    render(<AdminSidebar {...PROPS} collapsed />);

    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(screen.getByRole("link", { name: item.label })).toBeInTheDocument();
    }
  });
});

describe("resolvePageTitle", () => {
  it("memberi judul untuk setiap menu yang terdaftar", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(resolvePageTitle(item.href)).toBe(item.label);
    }
  });

  it("mengambil judul induk untuk route bersarang", () => {
    expect(resolvePageTitle("/admin/orders/INV-123")).toBe("Orders");
    expect(resolvePageTitle("/admin/products/import")).toBe("Produk & Harga");
  });

  it("jatuh ke 'Admin' untuk pathname di luar panel", () => {
    expect(resolvePageTitle("/")).toBe("Admin");
    expect(resolvePageTitle("/account")).toBe("Admin");
  });

  it("route admin yang belum terdaftar mewarisi judul Dashboard", () => {
    // MENDOKUMENTASIKAN perilaku yang ada, bukan menuntutnya. "/admin" adalah
    // prefix setiap route admin, jadi cabang `pathname.startsWith(href + "/")`
    // selalu menemukan Dashboard lebih dulu untuk halaman apa pun yang belum
    // masuk NAV_GROUPS. Akibatnya kosmetik saja - judul header salah sampai
    // menunya didaftarkan - tapi kalau suatu hari diperbaiki, tes ini yang
    // memberi tahu bahwa perubahannya disengaja.
    expect(resolvePageTitle("/admin/halaman-yang-belum-didaftarkan")).toBe("Dashboard");
  });
});
