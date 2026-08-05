import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProductForCheckout } from "@/lib/catalog/public";
import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}) {
  const { categorySlug, productSlug } = await params;
  const [product, paymentMethods] = await Promise.all([
    getProductForCheckout(categorySlug, productSlug),
    db.paymentMethodConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  if (!product) notFound();

  const authSession = await auth();
  let session: { email: string; walletBalance: bigint } | null = null;
  if (authSession?.user?.id) {
    const wallet = await db.wallet.findUnique({ where: { userId: authSession.user.id } });
    session = { email: authSession.user.email ?? "", walletBalance: wallet?.balance ?? 0n };
  }

  return (
    <ProductDetailClient
      product={product}
      session={session}
      paymentMethods={paymentMethods.map((m) => ({
        code: m.code,
        label: m.label,
        logoUrl: m.logoUrl,
        feeFlat: m.feeFlat.toString(),
        feePercent: m.feePercent,
      }))}
    />
  );
}
