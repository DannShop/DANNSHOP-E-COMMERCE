import { getInvoiceBranding } from "@/lib/invoice/branding";
import { buildManifest } from "@/lib/pwa/manifest";
import { getPwaSettings } from "@/lib/pwa/settings";

// Manifest app ADMIN -> /admin/app.webmanifest.
//
// Ditulis sebagai Route Handler biasa, BUKAN file konvensi `manifest.ts`.
// Konvensi metadata Next.js hanya berlaku di akar `app/`, dan nama berkas
// `manifest.*` di dalamnya sudah dipakai app toko. Route Handler adalah cara
// yang didukung untuk manifest kedua pada origin yang sama.
//
// Berbeda dari manifest toko, route ini TIDAK perlu dikecualikan dari rewrite
// maintenance: seluruh /admin memang sudah dikecualikan di proxy.ts.
//
// ⚠️ TAPI route ini DIKECUALIKAN KHUSUS dari gerbang admin & gerbang 2FA di
// proxy.ts (cari `isAdminManifest` di sana). Browser mengambil manifest dengan
// `credentials: "omit"` - cookie sesi tidak pernah ikut terkirim - jadi
// menggerbangnya berarti yang diterima browser adalah pengalihan ke /login,
// dan app admin tidak akan pernah bisa dipasang. Yang terbuka cuma nama app,
// warna, dan URL ikon.
//
// force-dynamic dengan alasan yang sama seperti manifest toko: Route Handler
// tanpa parameter request di-cache saat build secara bawaan, dan manifest yang
// dibekukan berarti ikon yang diunggah admin tidak pernah sampai ke HP. Cache
// tetap ada, tapi di CDN lewat s-maxage di bawah - yang bisa dibatalkan
// revalidatePath saat pengaturan disimpan.
export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, brandName] = await Promise.all([
    getPwaSettings(),
    getInvoiceBranding()
      .then((b) => b.brandName)
      .catch(() => "DannShop"),
  ]);

  return Response.json(buildManifest("admin", settings, brandName), {
    headers: {
      "Content-Type": "application/manifest+json",
      // Manifest boleh basi sebentar - yang dikandungnya cuma identitas app -
      // tapi tidak boleh basi berjam-jam, karena inilah satu-satunya jalan
      // perubahan ikon/nama sampai ke app yang sudah terpasang.
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
