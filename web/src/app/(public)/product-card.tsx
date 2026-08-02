import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
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
      <Card className="gap-0 p-0 transition-shadow hover:shadow-md">
        <div className="relative aspect-4/3 w-full bg-gradient-to-br from-primary to-accent">
          {product.banner && (
            <Image
              src={product.banner}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 25vw, 50vw"
              className="object-cover"
              unoptimized
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/25 to-transparent" />
        </div>
        <div className="px-3 py-2.5">
          <span className="font-heading text-sm font-bold line-clamp-2">{product.name}</span>
        </div>
      </Card>
    </Link>
  );
}
