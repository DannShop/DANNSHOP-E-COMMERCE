import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MITRA_NAV, isMitraNavActive, resolveMitraPage } from "@/app/mitra/nav-config";
import {
  ACCOUNT_NAV,
  ACCOUNT_NAV_GRID_CLASS,
  ACCOUNT_NAV_MOBILE,
  isAccountNavActive,
  isMobileNavActive,
} from "@/app/account/nav-config";

describe("navigasi portal mitra", () => {
  it("hanya menyalakan Beranda pada /mitra persis, bukan pada semua subhalaman", () => {
    expect(isMitraNavActive("/mitra", "/mitra")).toBe(true);
    expect(isMitraNavActive("/mitra/katalog", "/mitra")).toBe(false);
  });

  it("menyalakan menu untuk halaman anaknya", () => {
    expect(isMitraNavActive("/mitra/transaksi", "/mitra/transaksi")).toBe(true);
    expect(isMitraNavActive("/mitra/transaksi/INV-1", "/mitra/transaksi")).toBe(true);
  });

  it("memilih menu terpanjang yang cocok saat menentukan judul halaman", () => {
    expect(resolveMitraPage("/mitra/kredensial").label).toBe("Kredensial");
    expect(resolveMitraPage("/mitra").label).toBe("Beranda");
  });

  it("jatuh ke Beranda untuk path yang tidak ada di menu", () => {
    expect(resolveMitraPage("/mitra/entah-apa").label).toBe("Beranda");
  });

  it("tidak punya href kembar", () => {
    const hrefs = MITRA_NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("navigasi panel user", () => {
  // Tab bar mobile memakai kelas grid statis; Tailwind memindai kelas secara
  // literal, jadi jumlah menu yang tumbuh melewati peta yang tersedia akan
  // menghasilkan tab bar satu kolom yang menumpuk — gagal secara visual saja,
  // tanpa satu pun error. Test ini yang menangkapnya.
  //
  // Diturunkan dari daftar MOBILE, bukan desktop: sejak keduanya dipisah
  // (2026-08-18), sidebar boleh panjang sementara tab bar dijaga tetap pendek.
  it("punya kelas grid yang cocok dengan jumlah menu MOBILE", () => {
    expect(ACCOUNT_NAV_GRID_CLASS).toBe(`grid-cols-${ACCOUNT_NAV_MOBILE.length}`);
  });

  // Batas nyaman tab bar. Lewat dari lima, labelnya berhenti terbaca di layar
  // 360px dan yang tersisa cuma deretan ikon tanpa keterangan.
  it("tab bar mobile tidak lebih dari 5 tab", () => {
    expect(ACCOUNT_NAV_MOBILE.length).toBeLessThanOrEqual(5);
  });

  it("menyertakan pintu masuk kemitraan di sidebar desktop", () => {
    expect(ACCOUNT_NAV.some((i) => i.href === "/account/mitra")).toBe(true);
  });

  it("tidak membuat /account/mitra menyalakan Beranda", () => {
    expect(isAccountNavActive("/account/mitra", "/account")).toBe(false);
    expect(isAccountNavActive("/account/mitra", "/account/mitra")).toBe(true);
  });

  /**
   * Halaman yang tab-nya dilebur ke induknya di mobile.
   *
   * Yang dijaga di sini bukan kerapian, melainkan rasa tersesat: tanpa
   * pemetaan ini, membuka riwayat deposit atau halaman reseller di HP membuat
   * SELURUH tab bar padam sekaligus. Setiap halaman panel WAJIB punya tepat
   * satu tab yang menyala.
   */
  describe("halaman tanpa tab sendiri tetap menyalakan tab induknya", () => {
    const kasus: [string, string][] = [
      ["/account/deposits", "/account/deposit"],
      ["/account/reseller", "/account/settings"],
      ["/account/mitra", "/account/settings"],
    ];

    for (const [pathname, induk] of kasus) {
      it(`${pathname} → ${induk}`, () => {
        expect(isMobileNavActive(pathname, induk)).toBe(true);
        // Dan HANYA satu tab yang menyala, bukan dua.
        const menyala = ACCOUNT_NAV_MOBILE.filter((i) => isMobileNavActive(pathname, i.href));
        expect(menyala.map((i) => i.href)).toEqual([induk]);
      });
    }

    it("setiap tab mobile menyalakan dirinya sendiri", () => {
      for (const item of ACCOUNT_NAV_MOBILE) {
        expect(isMobileNavActive(item.href, item.href)).toBe(true);
      }
    });

    // Jebakan halus: "/account/deposits" tidak diawali "/account/deposit/",
    // jadi pencocokan prefix biasa TIDAK menyalakannya — itulah sebabnya
    // pemetaan eksplisit di atas ada.
    it("halaman isi saldo tidak ikut menyalakan tab lain", () => {
      const menyala = ACCOUNT_NAV_MOBILE.filter((i) => isMobileNavActive("/account/deposit", i.href));
      expect(menyala.map((i) => i.href)).toEqual(["/account/deposit"]);
    });
  });
});

describe("dokumen API partner", () => {
  const DOC_PATH = path.join(process.cwd(), "src", "content", "api-partner.md");
  const doc = readFileSync(DOC_PATH, "utf8");

  // Halaman /mitra/dokumentasi membaca file ini dari disk dan mengganti dua
  // placeholder di bawah dengan nilai milik mitra yang sedang login. Kalau
  // placeholder-nya diubah/dihapus saat menyunting dokumen, penggantian itu
  // berhenti bekerja TANPA error — mitra cuma melihat contoh milik orang lain
  // dan tidak ada yang tahu. Test ini mengunci kontrak itu.
  it("masih memuat placeholder username yang disubstitusi portal", () => {
    expect(doc).toContain("tokoabc");
  });

  it("masih memuat placeholder base URL yang disubstitusi portal", () => {
    expect(doc).toContain("https://dannshop.example.com");
  });

  // apiKey SENGAJA tidak pernah disubstitusi: menyuntikkan key asli ke halaman
  // berarti menaruh rahasia di sumber halaman dan cache browser.
  it("memakai apiKey contoh, bukan nilai asli mitra", () => {
    expect(doc).toContain("rahasia123");
  });

  it("mendokumentasikan endpoint cek IP yang dipakai untuk mengisi whitelist", () => {
    expect(doc).toContain("/api/v1/ip");
  });
});
