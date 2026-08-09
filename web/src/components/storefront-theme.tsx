import { getStorefrontAppearance, hasThemeOverride } from "@/lib/storefront/appearance";

// Menimpa variabel tema dengan warna & radius pilihan admin.
//
// Dipasang di ROOT layout, jadi berlaku di seluruh halaman termasuk invoice,
// login, dan panel admin - identitas warna toko memang seharusnya konsisten di
// semua tempat. Isinya cuma dua variabel CSS yang nilainya sudah divalidasi
// (hex untuk warna, angka 0-32 untuk radius), jadi tidak ada yang bisa
// merusak tata letak.
export async function StorefrontTheme() {
  const appearance = await getStorefrontAppearance();
  if (!hasThemeOverride(appearance)) return null;

  const declarations = [
    appearance.primaryColor ? `--primary:${appearance.primaryColor};` : "",
    `--radius:${appearance.radiusPx}px;`,
  ]
    .filter(Boolean)
    .join("");

  return <style dangerouslySetInnerHTML={{ __html: `:root{${declarations}}` }} />;
}

// CSS kustom bebas milik admin.
//
// SENGAJA TIDAK dipasang di root layout, melainkan hanya di layout storefront
// publik. Kalau dipasang global, satu aturan yang salah ketik (mis.
// `div{display:none}`) akan ikut mematikan panel admin - dan panel admin adalah
// satu-satunya tempat untuk memperbaikinya lagi. Memisahkannya berarti
// kesalahan CSS selalu bisa dibatalkan.
export async function StorefrontCustomCss() {
  const appearance = await getStorefrontAppearance();
  if (!appearance.customCss) return null;
  return <style dangerouslySetInnerHTML={{ __html: appearance.customCss }} />;
}
