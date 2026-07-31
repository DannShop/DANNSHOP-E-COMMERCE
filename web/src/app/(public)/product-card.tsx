import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { CatalogProduct } from "@/lib/catalog/public";

export function ProductCard({
  product,
  categorySlug,
}: {
  product: CatalogProduct;
  categorySlug: string;
}) {
  return (
    <Link href={`/${categorySlug}/${product.slug}`}>
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex h-24 items-center justify-center bg-gradient-to-br from-primary to-accent px-3 text-center">
          <span className="font-heading text-sm font-medium text-primary-foreground">
            {product.name}
          </span>
        </div>
        <CardContent className="flex flex-col gap-0.5 pt-3">
          {product.publisher && (
            <span className="text-xs text-muted-foreground">{product.publisher}</span>
          )}
          <span className="text-sm font-medium">
            Mulai dari Rp {product.startingPrice.toLocaleString("id-ID")}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
