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
    <Link href={`/${categorySlug}/${product.slug}`} className="group/tile block">
      <Card className="gap-0 p-0 shadow-sm transition duration-200 ease-out group-hover/tile:-translate-y-1 group-hover/tile:shadow-lg group-hover/tile:ring-2 group-hover/tile:ring-highlight">
        <div className="relative aspect-4/3 w-full bg-gradient-to-br from-primary to-accent">
          {(product.iconUrl ?? product.banner) && (
            <Image
              src={(product.iconUrl ?? product.banner)!}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 20vw, 33vw"
              className="object-cover"
              unoptimized
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/25 to-transparent" />
        </div>
        <div className="px-3 py-2.5">
          {/* Tinggi dikunci 2 baris (min-h-10 = 2 x line-height text-sm) supaya nama
              panjang ("Mobile Legends") dan pendek ("Free Fire") menghasilkan kartu
              setinggi sama — kalau tidak, baris grid ikut kartu tertinggi dan
              menyisakan celah kosong di kartu lain. */}
          <span className="line-clamp-2 min-h-10 font-heading text-sm font-bold">{product.name}</span>
        </div>
      </Card>
    </Link>
  );
}
