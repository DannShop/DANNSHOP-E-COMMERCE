import { describe, expect, it } from "vitest";
import { sanitizeHtml, sanitizeCss } from "@/lib/storefront/sanitize-html";

// Penyaring ini berdiri di antara HTML yang diketik admin dan halaman yang
// memuat tombol pembayaran. Tes di bawah bukan soal kerapian markup - masing-
// masing mewakili satu cara nyata menyuntikkan skrip yang harus tetap tertutup.

describe("sanitizeHtml - konten yang sah", () => {
  it("mempertahankan tag teks dasar beserta isinya", () => {
    expect(sanitizeHtml("<p>Halo <strong>dunia</strong></p>")).toBe("<p>Halo <strong>dunia</strong></p>");
  });

  it("mempertahankan class dan style yang diizinkan", () => {
    const out = sanitizeHtml('<div class="promo" style="color:#ff0000;padding:8px">Promo</div>');
    expect(out).toContain('class="promo"');
    expect(out).toContain("color:#ff0000");
    expect(out).toContain("padding:8px");
  });

  it("membuang tag di luar daftar-izin TAPI mempertahankan teks di dalamnya", () => {
    expect(sanitizeHtml("<section>Isi penting</section>")).toBe("Isi penting");
  });

  it("menutup sendiri tag yang ditinggalkan terbuka", () => {
    expect(sanitizeHtml("<div><p>lupa ditutup")).toBe("<div><p>lupa ditutup</p></div>");
  });

  it("mengabaikan tag penutup yang tidak punya pembuka", () => {
    expect(sanitizeHtml("teks</div>")).toBe("teks");
  });
});

describe("sanitizeHtml - upaya penyuntikan skrip", () => {
  it("membuang tag script beserta isinya tidak dieksekusi sebagai markup", () => {
    const out = sanitizeHtml('<script>alert(1)</script><p>aman</p>');
    expect(out).not.toContain("<script");
    expect(out).toContain("<p>aman</p>");
  });

  it("membuang semua atribut penangan kejadian", () => {
    const out = sanitizeHtml('<div onclick="steal()" onmouseover="x()">hai</div>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onmouseover");
    expect(out).toBe("<div>hai</div>");
  });

  it("menolak href javascript:", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">klik</a>');
    expect(out).not.toContain("javascript");
    expect(out).not.toContain("href=");
  });

  it("menolak href javascript: yang disisipi karakter kendali", () => {
    // "java\tscript:" tetap dieksekusi browser sebagai skema javascript,
    // tapi tidak cocok dengan pencocokan string mentah.
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">klik</a>');
    expect(out).not.toContain("href=");
  });

  it("menolak src data: (bisa membawa dokumen HTML berisi skrip)", () => {
    const out = sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="x" />');
    expect(out).not.toContain("src=");
  });

  it("menolak http:// polos supaya tidak memicu konten campuran", () => {
    expect(sanitizeHtml('<img src="http://contoh.com/a.png" alt="x" />')).not.toContain("src=");
  });

  it("mengizinkan https, relatif, dan mailto", () => {
    expect(sanitizeHtml('<a href="https://contoh.com">a</a>')).toContain('href="https://contoh.com"');
    expect(sanitizeHtml('<a href="/promo">a</a>')).toContain('href="/promo"');
    expect(sanitizeHtml('<a href="mailto:cs@contoh.com">a</a>')).toContain("mailto:cs@contoh.com");
  });

  it("memaksa rel noopener pada target=_blank", () => {
    const out = sanitizeHtml('<a href="https://contoh.com" target="_blank">a</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noopener");
  });

  it("membuang properti CSS yang bisa menutupi tombol bayar", () => {
    const out = sanitizeHtml('<div style="position:fixed;z-index:9999;color:red">x</div>');
    expect(out).not.toContain("position");
    expect(out).not.toContain("z-index");
    expect(out).toContain("color:red");
  });

  it("membuang url() di dalam style", () => {
    expect(sanitizeHtml('<div style="background:url(https://jahat.com/x)">x</div>')).not.toContain("url(");
  });

  it("membuang iframe dan form sepenuhnya sebagai tag", () => {
    const out = sanitizeHtml('<iframe src="https://jahat.com"></iframe><form action="https://jahat.com"></form>');
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<form");
  });

  it("meng-escape karakter < yang bukan bagian dari tag", () => {
    expect(sanitizeHtml("harga < 1000")).toBe("harga &lt; 1000");
  });
});

describe("sanitizeCss", () => {
  it("membuang @import", () => {
    expect(sanitizeCss('@import url("https://jahat.com/x.css"); body{color:red}')).not.toContain("@import");
  });

  it("membuang url() ke server luar", () => {
    expect(sanitizeCss("body{background:url(https://jahat.com/x.png)}")).not.toContain("jahat.com");
  });

  it("membuang tag style/script yang diselipkan untuk keluar dari elemennya", () => {
    const out = sanitizeCss("body{} </style><script>alert(1)</script>");
    expect(out).not.toContain("</style");
    expect(out).not.toContain("<script");
  });

  it("mempertahankan aturan CSS biasa", () => {
    expect(sanitizeCss(".site-header{box-shadow:none}")).toContain("box-shadow:none");
  });
});
