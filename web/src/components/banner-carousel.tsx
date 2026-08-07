"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SLIDE_INTERVAL_MS = 5000;

export interface BannerItem {
  id: string;
  /** Versi mobile (21:9). Juga dipakai desktop sebagai fallback. */
  imageUrl: string;
  /** Versi desktop (32:9). null = pakai imageUrl (akan dipotong atas-bawah). */
  imageUrlDesktop: string | null;
  linkUrl: string | null;
}

export function BannerCarousel({ banners }: { banners: BannerItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[index] as HTMLElement | undefined;
    slide?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, []);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % banners.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [banners.length]);

  useEffect(() => {
    scrollToIndex(active);
  }, [active, scrollToIndex]);

  // Sinkronkan dot indicator saat user swipe manual (bukan lewat tombol/auto-slide)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    function handleScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!track) return;
        const index = Math.round(track.scrollLeft / track.clientWidth);
        setActive((prev) => (prev === index ? prev : index));
      });
    }
    track.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (banners.length === 0) return null;

  return (
    <div className="group relative overflow-hidden rounded-[var(--radius)]">
      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {banners.map((b) => {
          // <picture> + <source media>, BUKAN dua <Image> yang disembunyikan
          // bergantian pakai class: dengan cara ini browser cuma MENGUNDUH satu
          // gambar yang cocok dengan lebar layarnya. Kalau dua-duanya dirender
          // lalu salah satunya di-`hidden`, keduanya tetap terunduh - boros
          // kuota di HP, dan banner ini `priority` (dimuat paling awal).
          //
          // Breakpoint 640px WAJIB sama persis dengan `sm:` Tailwind di bawah;
          // kalau meleset, ada rentang lebar di mana rasio kotak dan gambar
          // yang terpilih tidak cocok, dan object-cover mulai memotong lagi.
          const content = (
            <div className="relative aspect-21/9 w-full shrink-0 snap-start sm:aspect-32/9">
              <picture>
                {b.imageUrlDesktop && <source media="(min-width: 640px)" srcSet={b.imageUrlDesktop} />}
                {/* <img> polos, bukan next/image: next/image tidak mendukung srcSet per media query (art direction). Gambarnya juga sudah `unoptimized` sejak awal, jadi tidak ada optimasi yang hilang. */}
                <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
              </picture>
            </div>
          );
          return b.linkUrl ? (
            <Link key={b.id} href={b.linkUrl} className="block w-full shrink-0">
              {content}
            </Link>
          ) : (
            <div key={b.id} className="w-full shrink-0">
              {content}
            </div>
          );
        })}
      </div>

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Banner sebelumnya"
            onClick={() => setActive((prev) => (prev - 1 + banners.length) % banners.length)}
            className="absolute top-1/2 left-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Banner berikutnya"
            onClick={() => setActive((prev) => (prev + 1) % banners.length)}
            className="absolute top-1/2 right-2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Ke banner ${i + 1}`}
                onClick={() => setActive(i)}
                className={cn(
                  "h-1.5 rounded-full bg-background/70 transition-all",
                  i === active ? "w-5 bg-background" : "w-1.5",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
