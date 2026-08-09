import { getStorefrontAppearance, type SlotKey } from "@/lib/storefront/appearance";

// Titik sisip HTML kustom admin pada halaman publik.
//
// HTML-nya sudah disaring daftar-izin DUA KALI - saat disimpan dan saat dibaca
// (lihat lib/storefront/sanitize-html.ts). dangerouslySetInnerHTML di sini
// memang disengaja dan aman dalam konteks itu; menghapusnya berarti tidak ada
// slot sama sekali.
//
// Server Component, jadi tidak menambah satu byte pun JavaScript ke browser
// dan slot yang kosong benar-benar tidak merender apa-apa (bukan <div> kosong
// yang meninggalkan jarak di tata letak).
export async function StorefrontSlot({ name, className }: { name: SlotKey; className?: string }) {
  const appearance = await getStorefrontAppearance();
  const html = appearance.slots[name];
  if (!html) return null;
  return <div className={className ?? "storefront-slot"} dangerouslySetInnerHTML={{ __html: html }} />;
}
