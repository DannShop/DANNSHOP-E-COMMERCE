import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PANDUAN } from "@/lib/panduan/registry";

export const metadata: Metadata = { title: "Panduan" };

export default function PanduanIndexPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Dokumentasi operasional DannShop. Ditulis untuk dikerjakan sambil membuka panel ini, bukan untuk dibaca sekali
        lalu dilupakan.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {PANDUAN.map((p) => (
          <Link
            key={p.slug}
            href={`/admin/panduan/${p.slug}`}
            className="group flex flex-col gap-2 rounded-xl p-4 ring-1 ring-foreground/10 transition-colors hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <div className="flex items-center justify-between gap-2">
              <BookText className="size-4 text-muted-foreground" aria-hidden="true" />
              <Badge variant="muted">{p.audience}</Badge>
            </div>
            <p className="font-medium">{p.title}</p>
            <p className="text-xs text-muted-foreground">{p.summary}</p>
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary">
              Buka
              <ArrowRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
