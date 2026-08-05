import Link from "next/link";
import Image from "next/image";
import type { TrendingProduct } from "@/lib/catalog/trending";

export function TrendingSection({ products }: { products: TrendingProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-bold">🔥 TRENDING</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {products.map((p) => (
          <Link
            key={p.id}
            href={`/${p.categorySlug}/${p.slug}`}
            className="flex items-center gap-3 rounded-[var(--radius)] border bg-card p-3 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:ring-2 hover:ring-primary"
          >
            <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary to-accent">
              {p.iconUrl && <Image src={p.iconUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />}
            </div>
            <span className="truncate text-sm font-medium">{p.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
