import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProductForCheckout } from "@/lib/catalog/public";
import { getMembershipContext } from "@/lib/membership/tier";
import { hasBenefit } from "@/lib/membership/benefits";
import { getPaymentRules } from "@/lib/payment/rules";
import { ProductDetailClient } from "./product-detail-client";
import { StorefrontSlot } from "@/components/storefront-slot";
import { getStorefrontAppearance } from "@/lib/storefront/appearance";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}) {
  const { categorySlug, productSlug } = await params;
  // auth() dulu (murah, JWT, tidak hit DB) supaya userId sudah diketahui
  // sebelum fetch produk — getProductForCheckout butuh discountBp (dari tier
  // aktif, bukan lagi sekadar status login) buat resolve harga efektif
  // (flash/tier/normal) per item di server, bukan dihitung belakangan di client.
  const authSession = await auth();
  const membership = await getMembershipContext(authSession?.user?.id ?? null);

  const [product, paymentMethods, rules] = await Promise.all([
    getProductForCheckout(categorySlug, productSlug, membership.discountBp),
    db.paymentMethodConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getPaymentRules(),
  ]);
  if (!product) notFound();

  let session: { email: string; walletBalance: bigint } | null = null;
  if (authSession?.user?.id) {
    const wallet = await db.wallet.findUnique({ where: { userId: authSession.user.id } });
    session = { email: authSession.user.email ?? "", walletBalance: wallet?.balance ?? 0n };
  }

  // Slot checkout diambil di sini lalu diteruskan sebagai prop: form pemesanan
  // adalah komponen KLIEN, jadi <StorefrontSlot> (Server Component) tidak bisa
  // dipasang di dalamnya. HTML-nya sudah tersaring di lapisan appearance.
  const appearance = await getStorefrontAppearance();

  return (
    <>
    <StorefrontSlot name="product_detail_top" className="mx-auto mb-6 max-w-2xl" />
    <ProductDetailClient
      checkoutNoteHtml={appearance.slots.checkout_note}
      product={product}
      session={session}
      paymentMethods={paymentMethods.map((m) => ({
        code: m.code,
        label: m.label,
        logoUrl: m.logoUrl,
        feeFlat: m.feeFlat.toString(),
        feePercent: m.feePercent,
      }))}
      // Benefit tier IKUT dikirim, bukan cuma discountBp. Tanpa ini rincian di
      // halaman produk menagihkan fee & kode unik kepada member yang justru
      // dibebaskan darinya di server (actions/checkout.ts membaca benefit yang
      // sama) - angka yang dilihat pembeli jadi LEBIH BESAR dari yang benar-benar
      // ditagih. Sumber kebenarannya tetap server; ini murni supaya tampilannya
      // tidak berbohong.
      pricing={{
        freeFee: hasBenefit(membership.benefits, "free_order_fee"),
        noUniqueCode: hasBenefit(membership.benefits, "no_unique_code_order"),
        uniqueCodeMin: rules.uniqueCodeMin,
        uniqueCodeMax: rules.uniqueCodeMax,
        feeEnabled: rules.feeOrder,
        uniqueCodeEnabled: rules.uniqueCodeOrder,
      }}
    />
    <StorefrontSlot name="product_detail_bottom" className="mx-auto mt-6 max-w-2xl" />
    </>
  );
}
