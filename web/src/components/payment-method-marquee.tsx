"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

export interface MarqueeMethod {
  id: string;
  label: string;
  logoUrl: string | null;
}

// Strip "Virtual Account"/"Bill Payment" dari label panjang biar strip berjalan
// cuma nampilin nama bank pendek (mis. "BCA Virtual Account" -> "BCA"). Label
// aslinya (lengkap) tetap dipakai apa adanya di picker checkout/deposit & invoice.
function shortMethodName(label: string): string {
  return label.replace(/\s+(Virtual Account|Bill Payment)$/i, "").trim();
}

/** Kecepatan strip. Dipertahankan sama persis dengan versi CSS sebelumnya. */
const SPEED_PX_PER_SEC = 64;
/** Jarak (px) dari kursor di mana efek magnet mulai kerasa. */
const MAGNET_RADIUS = 120;
/** Skala maksimal badge yang tepat di bawah kursor. */
const MAGNET_MAX_SCALE = 1.15;
/** Angkatan maksimal (px). Badge h-14 (56px) + origin-bottom bikin scale nambah
 *  56 * 0.15 = 8.4px ke atas, jadi total naik ~12.4px — harus tetap di bawah
 *  padding vertikal container (py-4 = 16px) supaya nggak kepotong overflow. */
const MAGNET_LIFT = 4;
/** Kekentalan lerp magnet; makin besar makin cepat badge nyusul posisi target. */
const MAGNET_EASE = 14;

function MethodBadge({ method }: { method: MarqueeMethod }) {
  const name = shortMethodName(method.label);
  return (
    <div
      data-magnet
      className="flex h-14 w-32 shrink-0 origin-bottom items-center justify-center rounded-2xl bg-white px-4 py-3 shadow-sm"
    >
      {method.logoUrl ? (
        <span className="relative size-full">
          <Image src={method.logoUrl} alt={name} fill sizes="96px" className="object-contain" unoptimized />
        </span>
      ) : (
        <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">{name}</span>
      )}
    </div>
  );
}

export function PaymentMethodMarquee({ methods }: { methods: MarqueeMethod[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(4);

  // Titik tengah tiap badge relatif ke track, diukur sekali dari layout murni
  // (tanpa transform magnet) supaya scale badge nggak balik jadi input hitungan
  // jarak — kalau dibaca ulang tiap frame, efeknya bakal umpan-balik sendiri.
  const badgesRef = useRef<HTMLElement[]>([]);
  const centersRef = useRef<number[]>([]);
  const magnetRef = useRef<number[]>([]);
  const pointerXRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  // Dipakai tick buat menjadwalkan frame berikutnya tanpa merujuk dirinya sendiri.
  const frameRef = useRef<FrameRequestCallback>(() => {});

  const measure = useCallback(() => {
    const track = trackRef.current;
    const container = containerRef.current;
    const group = track?.firstElementChild as HTMLElement | null;
    if (!track || !container || !group) return;

    const badges = Array.from(track.querySelectorAll<HTMLElement>("[data-magnet]"));
    for (const el of badges) {
      el.style.transform = "";
      el.style.zIndex = "";
    }

    const groupWidth = group.getBoundingClientRect().width;
    if (groupWidth <= 0) return;

    // Geseran per putaran = lebar 1 grup dalam pixel presisi (bukan persen yang
    // dibulatkan browser), jadi frame terakhir animasi identik dengan frame awal.
    track.style.setProperty("--marquee-shift", `${groupWidth}px`);
    track.style.setProperty("--marquee-duration", `${groupWidth / SPEED_PX_PER_SEC}s`);

    const trackLeft = track.getBoundingClientRect().left;
    badgesRef.current = badges;
    centersRef.current = badges.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left - trackLeft + r.width / 2;
    });
    magnetRef.current = badges.map(() => 0);

    // Selalu sisakan minimal 1 grup cadangan di luar layar supaya strip nggak
    // pernah kehabisan konten, berapa pun lebar layar / jumlah metodenya.
    const needed = Math.ceil(container.clientWidth / groupWidth) + 2;
    setCopies((prev) => (prev === needed ? prev : needed));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, copies, methods.length]);

  const tick = useCallback((ts: number) => {
    rafRef.current = null;
    const track = trackRef.current;
    if (!track) return;

    const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = ts;

    // Satu-satunya pembacaan layout per frame; track sendiri nggak kena transform
    // magnet, jadi nulis transform badge di bawah nggak bikin reflow berulang.
    const trackLeft = track.getBoundingClientRect().left;
    const pointerX = pointerXRef.current;
    const badges = badgesRef.current;
    const centers = centersRef.current;
    const k = 1 - Math.exp(-dt * MAGNET_EASE);
    let settling = false;

    for (let i = 0; i < badges.length; i++) {
      let target = 0;
      if (pointerX !== null) {
        const dist = Math.abs(pointerX - (trackLeft + centers[i]));
        if (dist < MAGNET_RADIUS) {
          const t = 1 - dist / MAGNET_RADIUS;
          target = t * t * (3 - 2 * t);
        }
      }

      const value = magnetRef.current[i] + (target - magnetRef.current[i]) * k;
      magnetRef.current[i] = value;

      const el = badges[i];
      if (value > 0.002) {
        settling = true;
        const scale = 1 + value * (MAGNET_MAX_SCALE - 1);
        el.style.transform = `translateY(${-(value * MAGNET_LIFT)}px) scale(${scale})`;
        el.style.zIndex = "1";
      } else if (el.style.transform) {
        el.style.transform = "";
        el.style.zIndex = "";
      }
    }

    // Loop cuma hidup selama kursor di atas strip atau badge masih turun balik —
    // sisanya animasi jalan di compositor lewat CSS, main thread nganggur.
    if (pointerX !== null || settling) {
      rafRef.current = requestAnimationFrame(frameRef.current);
    }
  }, []);

  useEffect(() => {
    frameRef.current = tick;
  }, [tick]);

  const ensureLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse") return;
      pointerXRef.current = e.clientX;
      ensureLoop();
    },
    [ensureLoop],
  );

  const handlePointerLeave = useCallback(() => {
    pointerXRef.current = null;
    ensureLoop();
  }, [ensureLoop]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (methods.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="group overflow-hidden py-4"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div ref={trackRef} className="flex w-max animate-marquee">
        {Array.from({ length: copies }).map((_, groupIndex) => (
          <div key={groupIndex} className="flex shrink-0 items-center gap-6 pr-6">
            {methods.map((m) => (
              <MethodBadge key={`${m.id}-${groupIndex}`} method={m} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
