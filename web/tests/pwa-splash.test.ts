import { describe, expect, it } from "vitest";
import {
  defaultPwaSettings,
  isIconBackgroundStale,
  parsePwaSettings,
  type PwaAppSettings,
} from "@/lib/pwa/config";
import {
  IOS_DEVICES,
  SPLASH_MAX_SIDE,
  appearanceVersion,
  autoLogoSize,
  buildStartupImages,
  coverSize,
  pickSplashImage,
  splashImageUrl,
} from "@/lib/pwa/splash";

const gambar = (url: string, width = 1080, height = 1920) => ({ url, width, height });

function app(patch: Record<string, unknown>): PwaAppSettings {
  return parsePwaSettings({ toko: patch }).toko;
}

describe("parsePwaSettings - gambar layar pembuka", () => {
  it("bawaannya tidak ada gambar sama sekali", () => {
    const s = defaultPwaSettings();
    expect(s.toko.splash.portrait).toBeNull();
    expect(s.toko.splash.landscape).toBeNull();
  });

  it("menerima gambar yang lengkap dengan ukurannya", () => {
    const s = app({ splash: { portrait: gambar("https://blob/p.jpg") } });
    expect(s.splash.portrait).toEqual({ url: "https://blob/p.jpg", width: 1080, height: 1920 });
  });

  // Ukuran adalah satu-satunya cara perender menghitung skala "cover". Gambar
  // tanpa ukuran yang bisa dipercaya harus jatuh ke layar pembuka otomatis,
  // bukan dirender dengan ukuran tebakan yang meleset entah ke mana.
  it("membuang gambar yang ukurannya tidak masuk akal", () => {
    for (const buruk of [
      { url: "https://blob/p.jpg" },
      { url: "https://blob/p.jpg", width: 0, height: 1920 },
      { url: "https://blob/p.jpg", width: 1080, height: -5 },
      { url: "https://blob/p.jpg", width: 99999, height: 1920 },
      { url: "", width: 1080, height: 1920 },
    ]) {
      expect(app({ splash: { portrait: buruk } }).splash.portrait).toBeNull();
    }
  });
});

describe("isIconBackgroundStale", () => {
  it("diam pada pengaturan bawaan yang memang sudah senada", () => {
    expect(isIconBackgroundStale(defaultPwaSettings().toko, "toko")).toBe(false);
    expect(isIconBackgroundStale(defaultPwaSettings().admin, "admin")).toBe(false);
  });

  // Kasus TERBANYAK di lapangan, bukan kasus pinggiran: warna latar bawaan dulu
  // putih untuk kedua app, jadi setiap pemasangan lama menyimpan #FFFFFF di
  // belakang ikon toko yang violet. Kalau ikon bawaan tidak ikut dinilai,
  // peringatannya diam persis pada keadaan yang paling perlu diberitahukan.
  it("menyala untuk ikon BAWAAN yang tidak sewarna latar app", () => {
    expect(isIconBackgroundStale(app({ backgroundColor: "#FFFFFF" }), "toko")).toBe(true);
  });

  it("diam untuk ikon unggahan lama yang warnanya belum pernah dicatat", () => {
    expect(
      isIconBackgroundStale(
        app({
          backgroundColor: "#000000",
          icon: { any: "https://b/a.png", maskable: "https://b/m.png" },
        }),
        "toko",
      ),
    ).toBe(false);
  });

  it("menyala saat warna latar diganti setelah ikon dibuat", () => {
    const dibuatDenganPutih = {
      any: "https://b/a.png",
      maskable: "https://b/m.png",
      background: "#FFFFFF",
    };
    expect(
      isIconBackgroundStale(app({ backgroundColor: "#FFFFFF", icon: dibuatDenganPutih }), "toko"),
    ).toBe(false);
    expect(
      isIconBackgroundStale(app({ backgroundColor: "#000000", icon: dibuatDenganPutih }), "toko"),
    ).toBe(true);
  });

  it("tidak terpancing beda huruf besar-kecil", () => {
    const icon = { any: "https://b/a.png", maskable: "https://b/m.png", background: "#abcdef" };
    expect(isIconBackgroundStale(app({ backgroundColor: "#ABCDEF", icon }), "toko")).toBe(false);
  });
});

describe("appearanceVersion", () => {
  // Inilah yang membuat gambar layar pembuka boleh di-cache selamanya. Kalau ada
  // satu saja bahan yang tidak ikut dihitung, mengubahnya berarti perangkat
  // terus memakai gambar lama - tanpa error di mana pun.
  it("berubah kalau bahan apa pun yang terlihat ikut berubah", () => {
    const dasar = defaultPwaSettings().toko;
    const awal = appearanceVersion(dasar);

    expect(appearanceVersion({ ...dasar, backgroundColor: "#000000" })).not.toBe(awal);
    expect(
      appearanceVersion({
        ...dasar,
        icon: { any: "https://b/a.png", maskable: "https://b/m.png", background: "#000000" },
      }),
    ).not.toBe(awal);
    expect(
      appearanceVersion({ ...dasar, splash: { portrait: gambar("https://b/p.jpg"), landscape: null } }),
    ).not.toBe(awal);
    expect(
      appearanceVersion({
        ...dasar,
        splash: { portrait: null, landscape: gambar("https://b/l.jpg", 1920, 1080) },
      }),
    ).not.toBe(awal);
  });

  it("tidak berubah karena hal yang tidak terlihat di layar pembuka", () => {
    const dasar = defaultPwaSettings().toko;
    // Nama app & warna bilah status tidak ikut tergambar. Kalau ikut dihitung,
    // mengganti nama saja sudah memaksa render ulang 38 gambar per app.
    expect(appearanceVersion({ ...dasar, name: "Toko Lain", themeColor: "#111111" })).toBe(
      appearanceVersion(dasar),
    );
  });

  it("aman dipakai di URL", () => {
    expect(appearanceVersion(defaultPwaSettings().admin)).toMatch(/^[0-9a-z]+$/);
  });
});

describe("buildStartupImages", () => {
  const images = buildStartupImages("toko", "abc123");

  it("membuat versi potret DAN lanskap untuk tiap perangkat", () => {
    expect(images).toHaveLength(IOS_DEVICES.length * 2);
    expect(images.filter((i) => i.media.includes("orientation: portrait"))).toHaveLength(
      IOS_DEVICES.length,
    );
    expect(images.filter((i) => i.media.includes("orientation: landscape"))).toHaveLength(
      IOS_DEVICES.length,
    );
  });

  // iOS memilih gambar lewat media query yang cocok PERSIS. Dua entri dengan
  // query identik berarti satu perangkat tidak pernah bisa memakai yang kedua -
  // dan tidak ada yang error, gambarnya saja yang salah.
  it("tidak punya dua media query yang sama", () => {
    const medias = images.map((i) => i.media);
    expect(new Set(medias).size).toBe(medias.length);
  });

  it("meminta gambar seukuran piksel fisik layar", () => {
    const device = IOS_DEVICES.find((d) => d.width === 430 && d.ratio === 3);
    expect(device).toBeDefined();
    const potret = images.find(
      (i) => i.media.includes("device-width: 430px") && i.media.includes("orientation: portrait"),
    );
    const lanskap = images.find(
      (i) => i.media.includes("device-width: 430px") && i.media.includes("orientation: landscape"),
    );
    // 430x932 CSS px pada rasio 3 = 1290x2796 piksel fisik.
    expect(potret?.url).toContain("w=1290&h=2796");
    // Lanskap memakai angka yang sama, tertukar - BUKAN device-width yang ikut
    // tertukar. Pembeda orientasinya ada di `orientation`, sesuai konvensi iOS.
    expect(lanskap?.url).toContain("w=2796&h=1290");
    expect(lanskap?.media).toContain("device-width: 430px");
  });

  it("tidak pernah melewati batas ukuran yang diterima route", () => {
    for (const image of images) {
      const params = new URLSearchParams(image.url.split("?")[1]);
      expect(Number(params.get("w"))).toBeLessThanOrEqual(SPLASH_MAX_SIDE);
      expect(Number(params.get("h"))).toBeLessThanOrEqual(SPLASH_MAX_SIDE);
    }
  });

  it("memisahkan app lewat parameter, bukan lewat kebetulan", () => {
    const admin = buildStartupImages("admin", "abc123");
    expect(images[0].url).toContain("app=toko");
    expect(admin[0].url).toContain("app=admin");
    expect(admin[0].media).toBe(images[0].media);
  });
});

describe("splashImageUrl", () => {
  it("membawa sidik jari pengaturan di URL-nya", () => {
    expect(splashImageUrl("toko", "v9", 100, 200)).toBe("/pwa/splash?app=toko&w=100&h=200&v=v9");
  });
});

describe("pickSplashImage", () => {
  const potret = gambar("https://b/p.jpg");
  const lanskap = gambar("https://b/l.jpg", 1920, 1080);

  it("memakai gambar lanskap untuk layar yang lebih lebar dari tinggi", () => {
    expect(pickSplashImage({ portrait: potret, landscape: lanskap }, { width: 2796, height: 1290 }))
      .toBe(lanskap);
  });

  it("jatuh ke gambar potret kalau varian lanskap tidak diunggah", () => {
    expect(pickSplashImage({ portrait: potret, landscape: null }, { width: 2796, height: 1290 })).toBe(
      potret,
    );
  });

  it("mengembalikan null kalau belum ada gambar sama sekali", () => {
    expect(pickSplashImage({ portrait: null, landscape: null }, { width: 100, height: 200 })).toBeNull();
    // Gambar lanskap saja tidak dipakai untuk layar potret: hasilnya pita
    // sempit yang diperbesar habis-habisan, jauh lebih buruk daripada layar
    // pembuka otomatis yang memang dirancang untuk ukuran itu.
    expect(pickSplashImage({ portrait: null, landscape: lanskap }, { width: 1080, height: 1920 })).toBeNull();
  });
});

describe("coverSize", () => {
  it("selalu menutupi kotak target sepenuhnya", () => {
    const kotak = [
      { width: 1290, height: 2796 },
      { width: 2048, height: 2732 },
      { width: 2796, height: 1290 },
    ];
    for (const box of kotak) {
      const size = coverSize({ width: 1080, height: 1920 }, box);
      expect(size.width).toBeGreaterThanOrEqual(box.width);
      expect(size.height).toBeGreaterThanOrEqual(box.height);
    }
  });

  it("mempertahankan perbandingan sisi gambar aslinya", () => {
    const size = coverSize({ width: 1000, height: 500 }, { width: 800, height: 800 });
    expect(size.width / size.height).toBeCloseTo(2, 2);
  });
});

describe("autoLogoSize", () => {
  it("mengikat diri ke sisi TERPENDEK", () => {
    // Kalau dipatok ke sisi terpanjang, logo pada layar lanskap melebar keluar
    // layar - tepat pada perangkat (iPad) yang paling mungkin dimiringkan.
    expect(autoLogoSize({ width: 2796, height: 1290 })).toBe(autoLogoSize({ width: 1290, height: 2796 }));
    expect(autoLogoSize({ width: 1000, height: 2000 })).toBe(420);
  });
});
