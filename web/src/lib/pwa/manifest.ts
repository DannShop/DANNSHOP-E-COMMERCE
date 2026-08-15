import type { MetadataRoute } from "next";
import {
  ICON_SIZE_PX,
  resolveAppNames,
  resolveIcon,
  type PwaAppKind,
  type PwaSettings,
} from "@/lib/pwa/config";

// Menyusun isi manifest untuk salah satu dari dua app. Murni: tidak menyentuh
// DB maupun request, jadi bentuk keluarannya bisa diuji langsung.

interface AppShape {
  startUrl: string;
  /**
   * Identitas app di mata browser. INI yang membuat "Toko" dan "Admin" dianggap
   * dua app terpisah, bukan URL manifest-nya - tanpa id yang berbeda, memasang
   * yang kedua hanya menimpa yang pertama.
   *
   * Nilainya tidak boleh berubah setelah app pernah dipasang: id yang berganti
   * dibaca sebagai app yang sama sekali lain, dan yang lama jadi yatim di home
   * screen (ikonnya tetap ada, tapi tidak pernah lagi menerima pembaruan).
   */
  id: string;
  scope: string;
  shortcuts: NonNullable<MetadataRoute.Manifest["shortcuts"]>;
}

const SHAPES: Record<PwaAppKind, AppShape> = {
  toko: {
    startUrl: "/",
    id: "/",
    scope: "/",
    shortcuts: [
      { name: "Isi Saldo", short_name: "Isi Saldo", url: "/account/deposit" },
      { name: "Pesanan Saya", short_name: "Pesanan", url: "/account/orders" },
    ],
  },
  admin: {
    startUrl: "/admin",
    id: "/admin",
    // scope "/admin" mengunci app admin di dalam panel: tautan ke storefront
    // dibuka di browser biasa, bukan di dalam jendela app. Itu yang diinginkan -
    // app ini alat kerja, dan halaman toko punya app-nya sendiri.
    scope: "/admin",
    shortcuts: [
      { name: "Orders", short_name: "Orders", url: "/admin/orders" },
      { name: "Produk & Harga", short_name: "Produk", url: "/admin/products" },
    ],
  },
};

export function buildManifest(
  kind: PwaAppKind,
  settings: PwaSettings,
  brandName: string,
): MetadataRoute.Manifest {
  const app = settings[kind];
  const shape = SHAPES[kind];
  const { name, shortName } = resolveAppNames(app, kind, brandName);
  const icon = resolveIcon(app, kind);
  const sizes = `${ICON_SIZE_PX}x${ICON_SIZE_PX}`;

  return {
    id: shape.id,
    name,
    short_name: shortName,
    description:
      kind === "admin"
        ? `Panel admin ${brandName} — kelola produk, harga, dan pesanan.`
        : `${brandName} — topup game, pulsa, e-money, dan PLN otomatis 24 jam.`,
    start_url: shape.startUrl,
    scope: shape.scope,
    display: "standalone",
    // orientation SENGAJA tidak dikunci. Tabel pesanan & harga di panel admin
    // jauh lebih terbaca dalam mode lanskap, dan memaksa portrait menghilangkan
    // satu-satunya cara membacanya di HP.
    theme_color: settings.themeColor,
    background_color: settings.backgroundColor,
    lang: "id",
    dir: "ltr",
    categories: kind === "admin" ? ["business", "productivity"] : ["shopping", "finance"],
    shortcuts: shape.shortcuts,
    icons: [
      { src: icon.any, sizes, type: "image/png", purpose: "any" },
      // Varian maskable dipisah, bukan dua purpose pada satu berkas. Android
      // memotong ikon jadi lingkaran/squircle; menandai gambar tanpa ruang aman
      // sebagai maskable membuat pinggiran logonya terpotong.
      { src: icon.maskable, sizes, type: "image/png", purpose: "maskable" },
    ],
  };
}
