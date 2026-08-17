import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLORS,
  DEFAULT_ICONS,
  SHORT_NAME_MAX,
  defaultPwaSettings,
  parsePwaSettings,
  resolveAppNames,
  resolveIcon,
} from "@/lib/pwa/config";
import { buildManifest } from "@/lib/pwa/manifest";

describe("parsePwaSettings", () => {
  it("jatuh ke default untuk nilai yang bukan objek", () => {
    for (const bad of [null, undefined, "bukan objek", 42, []]) {
      const s = parsePwaSettings(bad);
      expect(s.toko.themeColor).toBe(DEFAULT_COLORS.toko.themeColor);
      expect(s.admin.backgroundColor).toBe(DEFAULT_COLORS.admin.backgroundColor);
      expect(s.toko.icon).toBeNull();
      expect(s.admin.icon).toBeNull();
    }
  });

  // Warna bawaan tiap app diambil dari warna dominan ikon bawaannya. Kalau
  // keduanya menyimpang, layar pembuka kembali terlihat seperti logo yang
  // ditempel di atas kotak berbeda warna - keluhan yang memulai fitur ini.
  it("memberi tiap app warna latar yang cocok dengan ikon bawaannya", () => {
    const s = defaultPwaSettings();
    expect(s.toko.backgroundColor).toBe(DEFAULT_ICONS.toko.background);
    expect(s.admin.backgroundColor).toBe(DEFAULT_ICONS.admin.background);
    expect(s.toko.backgroundColor).not.toBe(s.admin.backgroundColor);
  });

  it("menolak warna yang bukan hex", () => {
    const s = parsePwaSettings({
      toko: { themeColor: "javascript:alert(1)", backgroundColor: "red" },
    });
    expect(s.toko.themeColor).toBe(DEFAULT_COLORS.toko.themeColor);
    expect(s.toko.backgroundColor).toBe(DEFAULT_COLORS.toko.backgroundColor);
  });

  // Warna dulu tersimpan sekali di tingkat atas untuk dua app sekaligus. Baris
  // SiteSetting yang sudah ada di produksi masih berbentuk itu, dan kalau
  // dibaca sebagai "tidak ada", warna yang sudah disetel admin hilang diam-diam
  // pada deploy pertama setelah pemisahan.
  it("membaca warna bentuk lama sebagai bawaan kedua app", () => {
    const s = parsePwaSettings({ themeColor: "#123456", backgroundColor: "#ABCDEF" });
    expect(s.toko.themeColor).toBe("#123456");
    expect(s.admin.themeColor).toBe("#123456");
    expect(s.toko.backgroundColor).toBe("#ABCDEF");
    expect(s.admin.backgroundColor).toBe("#ABCDEF");
  });

  it("mendahulukan warna per app daripada warna bentuk lama", () => {
    const s = parsePwaSettings({
      themeColor: "#123456",
      admin: { themeColor: "#000000" },
    });
    expect(s.toko.themeColor).toBe("#123456");
    expect(s.admin.themeColor).toBe("#000000");
  });

  // Ini penjaga utamanya: manifest yang menunjuk ke satu URL ikon yang tidak
  // ada membuat Chrome MENOLAK memasang app sama sekali. Setengah pasang harus
  // jatuh ke ikon bawaan, bukan dipakai apa adanya.
  it("membuang ikon yang cuma sebagian", () => {
    expect(parsePwaSettings({ toko: { icon: { any: "https://x/a.png" } } }).toko.icon).toBeNull();
    expect(
      parsePwaSettings({ toko: { icon: { maskable: "https://x/m.png" } } }).toko.icon,
    ).toBeNull();
    expect(parsePwaSettings({ toko: { icon: { any: "  ", maskable: "  " } } }).toko.icon).toBeNull();
  });

  it("menerima pasangan ikon yang lengkap", () => {
    const s = parsePwaSettings({
      toko: { icon: { any: "https://x/a.png", maskable: "https://x/m.png" } },
    });
    expect(s.toko.icon).toEqual({
      any: "https://x/a.png",
      maskable: "https://x/m.png",
      // Ikon tersimpan dari versi kode sebelum warnanya dicatat. Harus terbaca
      // sebagai "tidak diketahui", bukan memicu peringatan warna basi.
      background: "",
    });
  });

  it("memotong nama pendek yang kepanjangan", () => {
    const s = parsePwaSettings({ toko: { shortName: "NamaTokoYangKepanjanganSekali" } });
    expect(s.toko.shortName).toHaveLength(SHORT_NAME_MAX);
  });
});

describe("resolveAppNames", () => {
  const kosong = { name: "", shortName: "", icon: null };

  it("ikut nama brand kalau admin tidak mengisi apa pun", () => {
    expect(resolveAppNames(kosong, "toko", "DannShop")).toEqual({
      name: "DannShop",
      shortName: "DannShop",
    });
  });

  it("menempelkan ' Admin' hanya pada nama turunan", () => {
    expect(resolveAppNames(kosong, "admin", "DannShop").name).toBe("DannShop Admin");
    // Nama yang diketik admin dipakai apa adanya - kalau tidak, mengetik
    // "DannShop Admin" keluar sebagai "DannShop Admin Admin".
    expect(resolveAppNames({ ...kosong, name: "DannShop Admin" }, "admin", "DannShop").name).toBe(
      "DannShop Admin",
    );
  });

  it("memberi kedua app label home screen yang berbeda", () => {
    const toko = resolveAppNames(kosong, "toko", "DannShop");
    const admin = resolveAppNames(kosong, "admin", "DannShop");
    expect(toko.shortName).not.toBe(admin.shortName);
    expect(admin.shortName).toBe("Admin");
  });

  it("memakai kata pertama, bukan potongan huruf, untuk nama pendek", () => {
    expect(resolveAppNames(kosong, "toko", "DannShop Digital").shortName).toBe("DannShop");
  });
});

describe("resolveIcon", () => {
  it("jatuh ke ikon bawaan per jenis app", () => {
    expect(resolveIcon({ icon: null }, "toko")).toEqual(DEFAULT_ICONS.toko);
    expect(resolveIcon({ icon: null }, "admin")).toEqual(DEFAULT_ICONS.admin);
  });
});

describe("buildManifest", () => {
  const settings = defaultPwaSettings();

  it("memberi dua app id yang berbeda", () => {
    // Tanpa id yang berbeda, memasang app kedua hanya menimpa yang pertama -
    // pembeli dan admin tidak bisa punya dua ikon terpisah di satu HP.
    const toko = buildManifest("toko", settings, "DannShop");
    const admin = buildManifest("admin", settings, "DannShop");
    expect(toko.id).not.toBe(admin.id);
    expect(toko.start_url).toBe("/");
    expect(admin.start_url).toBe("/admin");
  });

  it("selalu menyertakan varian any DAN maskable", () => {
    const m = buildManifest("toko", settings, "DannShop");
    const purposes = (m.icons ?? []).map((i) => i.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
  });

  it("memenuhi syarat pemasangan: ikon persegi minimal 192px", () => {
    for (const kind of ["toko", "admin"] as const) {
      const m = buildManifest(kind, settings, "DannShop");
      expect(m.icons?.length).toBeGreaterThan(0);
      for (const icon of m.icons ?? []) {
        const [w, h] = String(icon.sizes).split("x").map(Number);
        expect(w).toBe(h);
        expect(w).toBeGreaterThanOrEqual(192);
        expect(icon.type).toBe("image/png");
      }
      expect(m.display).toBe("standalone");
      expect(m.name).toBeTruthy();
      expect(m.short_name).toBeTruthy();
    }
  });

  it("memakai ikon kustom kalau sudah diunggah", () => {
    const custom = parsePwaSettings({
      admin: { icon: { any: "https://blob/a.png", maskable: "https://blob/m.png" } },
    });
    const m = buildManifest("admin", custom, "DannShop");
    expect(m.icons?.map((i) => i.src)).toEqual(["https://blob/a.png", "https://blob/m.png"]);
  });

  it("meneruskan warna milik app itu sendiri, bukan warna app sebelah", () => {
    const warna = parsePwaSettings({
      toko: { themeColor: "#123456", backgroundColor: "#ABCDEF" },
      admin: { themeColor: "#654321", backgroundColor: "#FEDCBA" },
    });
    const toko = buildManifest("toko", warna, "DannShop");
    const admin = buildManifest("admin", warna, "DannShop");
    expect(toko.theme_color).toBe("#123456");
    expect(toko.background_color).toBe("#ABCDEF");
    expect(admin.theme_color).toBe("#654321");
    expect(admin.background_color).toBe("#FEDCBA");
  });

  it("mengunci app admin di dalam /admin", () => {
    // scope "/" pada app admin akan menyeret seluruh storefront ke dalam
    // jendela app kerja - dan halaman toko sudah punya app-nya sendiri.
    expect(buildManifest("admin", settings, "DannShop").scope).toBe("/admin");
  });
});
