import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminSidebar } from "@/app/admin/admin-sidebar";
import { NAV_GROUPS, resolvePageTitle } from "@/app/admin/nav-config";
import { PERMISSIONS } from "@/lib/rbac/permissions";

// logoutAction adalah Server Action; berkasnya menarik auth + Prisma begitu
// di-import, dan tidak satu pun dari itu relevan untuk memastikan menunya
// tampil. Yang diuji di sini bentuk sidebar-nya, bukan proses keluarnya.
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));

// Pemilik toko: role ADMIN lolos semua izin tanpa perlu dicentang, jadi
// daftar izinnya sengaja KOSONG di sini. Kalau tes ini harus mengisinya supaya
// menunya muncul, artinya ADMIN sudah berhenti otomatis punya semua akses -
// dan itu jalan tercepat bagi pemilik toko mengunci dirinya sendiri.
const PROPS = {
  pathname: "/admin",
  collapsed: false,
  onToggleCollapse: () => {},
  userEmail: "admin@dannshop.id",
  userRole: "ADMIN",
  permissions: [],
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

/**
 * Penyaringan menu untuk karyawan.
 *
 * Bukan fitur keamanan — menu yang disembunyikan tetap bisa diketik langsung di
 * address bar, dan yang menolaknya adalah proxy.ts. Yang diuji di sini bahwa
 * karyawan tidak dihadapkan pada menu yang setiap kali diklik menolaknya, dan
 * bahwa penyaringnya memakai aturan yang SAMA dengan gerbang route-nya.
 */
describe("AdminSidebar - penyaringan izin karyawan", () => {
  const asStaff = (permissions: string[]) => ({
    ...PROPS,
    userRole: "STAFF",
    permissions: permissions as never,
  });

  it("hanya menampilkan menu yang boleh dibuka karyawan itu", () => {
    render(<AdminSidebar {...asStaff(["orders.view"])} />);

    expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Produk & Harga" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Laporan Penjualan" })).not.toBeInTheDocument();
    // Dashboard = ringkasan omzet, jadi ikut tertutup tanpa finance.view.
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("membuang judul grup yang seluruh isinya tersaring", () => {
    render(<AdminSidebar {...asStaff(["orders.view"])} />);

    expect(screen.getByText("Transaksi")).toBeInTheDocument();
    // Tidak ada satu pun menu Katalog yang boleh dibuka - judulnya tidak boleh
    // menggantung sendirian di atas ruang kosong.
    expect(screen.queryByText("Katalog")).not.toBeInTheDocument();
  });

  it("tidak pernah menampilkan Karyawan & Peran ke karyawan", () => {
    // Dicoba dengan SELURUH izin sekaligus: halaman ini dikunci ke role, bukan
    // ke izin, justru supaya tidak bisa didelegasikan.
    render(<AdminSidebar {...asStaff([...PERMISSIONS])} />);
    expect(screen.queryByRole("link", { name: "Karyawan & Peran" })).not.toBeInTheDocument();
  });

  it("menampilkannya untuk pemilik toko", () => {
    render(<AdminSidebar {...PROPS} />);
    expect(screen.getByRole("link", { name: "Karyawan & Peran" })).toBeInTheDocument();
  });

  it("karyawan tanpa izin sama sekali tetap bisa mencapai halaman keamanan", () => {
    // Gerbang 2FA mewajibkan pemasangan 2FA sebelum bisa ke mana-mana, dan
    // satu-satunya tempat memasangnya ada di menu itu.
    render(<AdminSidebar {...asStaff([])} />);
    expect(screen.getByRole("link", { name: "Keamanan Akun" })).toBeInTheDocument();
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
