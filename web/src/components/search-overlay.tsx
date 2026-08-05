"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function closeSearch() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSearch();
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeSearch();
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
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

  // Lebar maks dihitung relatif ke viewport (bukan persentase dari wrapper-nya
  // sendiri yang cuma 32px), dikurangi ruang yang dipakai sibling di kanan
  // (gap + tombol darkmode + gap + tombol sidebar + padding kanan header =
  // 8+32+8+32+16 = 96px = 6rem) - biar sisi kiri panel tidak kepotong viewport
  // di layar sempit. Di layar lebar dibatasi 22rem biar tidak kebesaran.
  const expandedWidth = "w-[min(22rem,calc(100vw-6rem))]";

  return (
    // Wrapper statis cuma sebesar tombol ikon (size-8) supaya tidak mengganggu
    // urutan flex navbar (darkmode/sidebar di sebelah kanan tidak ikut geser).
    // Panel beneran posisinya absolute, right-0 dipatok di tempat ikon berada,
    // dan lebarnya di-animate dari 32px -> lebar penuh - jadi expand-nya
    // "memanjang ke kiri", bukan popup/modal fullscreen.
    <div ref={rootRef} className="relative size-8">
      <div
        className={`absolute inset-y-0 right-0 flex items-center overflow-hidden rounded-lg transition-[width] duration-300 ease-out ${
          open ? `${expandedWidth} border border-input bg-background shadow-lg` : "w-8"
        }`}
      >
        {!open ? (
          <Button variant="ghost" size="icon" aria-label="Cari produk" onClick={() => setOpen(true)}>
            <Search className="size-4" />
          </Button>
        ) : (
          <>
            <Search className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk atau game..."
              aria-label="Cari produk"
              className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button variant="ghost" size="icon" aria-label="Tutup pencarian" onClick={closeSearch}>
              <X className="size-4" />
            </Button>
          </>
        )}
      </div>

      {open && query.trim() && (
        <div className={`no-scrollbar absolute top-full right-0 z-10 mt-2 max-h-80 ${expandedWidth} overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg`}>
          {loading && <p className="px-3 py-2 text-sm text-muted-foreground">Mencari...</p>}
          {!loading && visibleResults.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Tidak ada hasil untuk &quot;{query}&quot;.</p>
          )}
          {!loading &&
            visibleResults.map((r) => (
              <Link
                key={r.id}
                href={`/${r.categorySlug}/${r.slug}`}
                onClick={closeSearch}
                className="block rounded-md px-3 py-2 hover:bg-muted"
              >
                <div className="font-medium">{r.name}</div>
                {r.publisher && <div className="text-xs text-muted-foreground">{r.publisher}</div>}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
