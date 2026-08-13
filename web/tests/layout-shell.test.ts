import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CSS = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const shellSource = (file: string) =>
  readFileSync(path.join(process.cwd(), "src", "app", file), "utf8");

/**
 * Penjaga satu bug yang mahal dan sangat mudah kembali.
 *
 * `overflow-x: hidden` di <html>/<body> terlihat tidak berbahaya dan itulah
 * masalahnya: menurut spesifikasi, kalau satu sumbu `hidden` dan sumbu lainnya
 * `visible`, yang `visible` dipaksa jadi `auto`. Elemennya berubah jadi scroll
 * container, dan SEMUA `position: sticky` di dalamnya diam-diam berhenti
 * bekerja — tanpa error, tanpa peringatan build, tanpa test yang gagal.
 *
 * Gejalanya di proyek ini: sidebar portal ikut tergulung saat halaman panjang
 * digulir. Kena /mitra dan /account sekaligus; di /account tidak pernah
 * ketahuan cuma karena halamannya pendek.
 *
 * `clip` memberi efek visual yang sama persis tanpa membuat scroll container.
 */
describe("globals.css — sumbu overflow root", () => {
  it("memakai overflow-x-clip di <body>, bukan overflow-x-hidden", () => {
    const body = /(\n\s*body\s*\{[^}]*\})/.exec(CSS)?.[1] ?? "";
    expect(body).toContain("overflow-x-clip");
    expect(body).not.toContain("overflow-x-hidden");
  });

  it("memakai overflow-x-clip di <html>, bukan overflow-x-hidden", () => {
    const html = /(\n\s*html\s*\{[^}]*\})/.exec(CSS)?.[1] ?? "";
    expect(html).toContain("overflow-x-clip");
    expect(html).not.toContain("overflow-x-hidden");
  });

  it("menyimpan alasannya di komentar supaya tidak 'diperbaiki' balik", () => {
    expect(CSS).toMatch(/scroll container/i);
    expect(CSS).toMatch(/sticky/i);
  });
});

describe("sidebar portal tetap terkunci saat halaman digulir", () => {
  // Trio kelas ini yang membuat sidebar diam di tempat: `sticky top-0` butuh
  // tinggi tetap (`h-dvh`) supaya punya ruang untuk berlabuh, dan `shrink-0`
  // supaya tidak digencet flex saat konten melebar.
  for (const [name, file] of [
    ["portal mitra", "mitra/mitra-shell.tsx"],
    ["panel user", "account/account-shell.tsx"],
  ] as const) {
    it(`${name}: <aside> memakai sticky + h-dvh`, () => {
      const src = shellSource(file);
      const aside = /<aside[^>]*className="([^"]+)"/.exec(src)?.[1] ?? "";
      expect(aside).toContain("sticky");
      expect(aside).toContain("top-0");
      expect(aside).toContain("h-dvh");
      expect(aside).toContain("shrink-0");
    });
  }
});
