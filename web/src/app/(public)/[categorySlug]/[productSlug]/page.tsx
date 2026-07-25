import { notFound } from "next/navigation";
import { getProductForCheckout } from "@/lib/catalog/public";
import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}) {
  const { categorySlug, productSlug } = await params;
  const product = await getProductForCheckout(categorySlug, productSlug);
  if (!product) notFound();

  return <ProductDetailClient product={product} />;
}
