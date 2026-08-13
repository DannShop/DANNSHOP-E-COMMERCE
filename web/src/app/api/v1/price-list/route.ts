import { authenticatePartner, readPartnerBody } from "@/lib/partner/auth";
import { PARTNER_RC, partnerError, partnerJson } from "@/lib/partner/response";
import { SIGN_SALT_PRICE_LIST } from "@/lib/partner/signature";
import { buildPartnerPriceList } from "@/lib/partner/price-list";

export const dynamic = "force-dynamic";

// POST /api/v1/price-list — katalog + harga yang berlaku untuk partner ini.
// sign = md5(username + apiKey + "pricelist")
//
// Filter opsional di body: { category: "top-up-game" } atau { product: "mobile-legends" }.
//
// Penyusunan daftarnya ada di lib/partner/price-list.ts, dipakai bersama dengan
// halaman Katalog di portal mitra — harga di layar dan harga yang ditagih API
// harus mustahil berbeda.
export async function POST(request: Request) {
  const parsed = await readPartnerBody(request);
  if (!parsed.ok) return parsed.response;

  // Limit lebih ketat dari endpoint lain: satu panggilan ini membaca seluruh
  // katalog. Partner diharapkan men-cache hasilnya, bukan memanggilnya per
  // tampilan halaman — dan dokumentasi menyebutkan itu secara eksplisit.
  const auth = await authenticatePartner(request, parsed.body, SIGN_SALT_PRICE_LIST, {
    limit: 12,
    windowMs: 60_000,
  });
  if (!auth.ok) return auth.response;

  const body = parsed.body as { category?: unknown; product?: unknown };

  try {
    // TANPA skip/take: endpoint ini sengaja mengembalikan katalog UTUH. Mitra
    // diharapkan memanggilnya sesekali lalu men-cache hasilnya, jadi memaginasi
    // di sini justru memaksa mereka menulis loop halaman untuk mendapatkan hal
    // yang sama. Halaman Katalog di portal memaginasi karena masalahnya berbeda:
    // di sana yang mahal adalah mengirim seluruh katalog ke BROWSER.
    const list = await buildPartnerPriceList(auth.partner.userId, {
      categorySlug: typeof body.category === "string" ? body.category.trim() : undefined,
      productSlug: typeof body.product === "string" ? body.product.trim() : undefined,
    });

    return partnerJson({
      rc: PARTNER_RC.SUCCESS,
      message: "Berhasil",
      // Harga di sini SUDAH termasuk diskon tier partner. Disebutkan supaya
      // partner tidak menghitung ulang diskonnya sendiri dan salah ambil margin.
      tier: list.tier,
      total_product: list.total,
      products: list.products,
    });
  } catch (e) {
    console.error("POST /api/v1/price-list: gagal menyusun katalog", { partnerId: auth.partner.id, error: e });
    return partnerError(PARTNER_RC.SYSTEM_ERROR, "Gagal mengambil price list, coba lagi.", 500);
  }
}
