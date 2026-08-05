"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchResult {
  id: string;
  slug: string;
  categorySlug: string;
  name: string;
  publisher: string | null;
}

export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => setResults(Array.isArray(data.results) ? data.results : []))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
        })
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  // results tidak di-reset lewat effect (menghindari setState sinkron di body
  // effect) - dropdown query kosong ditutupi di sini, hasil lama di state
  // cukup diabaikan sampai fetch berikutnya menimpanya.
  const visibleResults = query.trim() ? results : [];

  return (
    <>
      <button
        type="button"
        aria-label="Cari produk"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-full border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Cari produk atau game...</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4 backdrop-blur-sm sm:items-start sm:justify-center">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama produk atau game..."
                aria-label="Cari produk"
                className="h-11 flex-1 text-base"
              />
              <Button variant="ghost" size="icon" aria-label="Tutup pencarian" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Mencari...</p>}
            {!loading && query.trim() && visibleResults.length === 0 && (
              <p className="text-sm text-muted-foreground">Tidak ada hasil untuk &quot;{query}&quot;.</p>
            )}

            <div className="flex flex-col gap-1 overflow-y-auto">
              {visibleResults.map((r) => (
                <Link
                  key={r.id}
                  href={`/${r.categorySlug}/${r.slug}`}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 hover:bg-muted"
                >
                  <div className="font-medium">{r.name}</div>
                  {r.publisher && <div className="text-xs text-muted-foreground">{r.publisher}</div>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
