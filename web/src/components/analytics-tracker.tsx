"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const SESSION_KEY = "ds_sid";

// ID sesi disimpan di sessionStorage, bukan cookie: tidak ikut terkirim di
// setiap permintaan, hilang sendiri saat tab ditutup, dan tidak bisa dipakai
// melacak antar-situs. Cukup untuk menjawab "berapa halaman yang dibuka dalam
// satu kunjungan", yang memang satu-satunya kegunaannya di sini.
function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // Mode privat sangat ketat / storage diblokir - tetap kirim dengan ID
    // sekali pakai. Pageview-nya tetap terhitung, cuma tidak terangkai jadi sesi.
    return crypto.randomUUID();
  }
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  // Path terakhir yang sudah dikirim. Tanpa penjaga ini, tiap render ulang
  // (mis. karena state induk berubah) akan mengirim beacon lagi untuk halaman
  // yang sama dan menggandakan hitungan pageview.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return;
    lastSent.current = pathname;

    const payload = JSON.stringify({ path: pathname, sessionId: getSessionId() });
    // keepalive: permintaan tetap diselesaikan browser walau pengunjung
    // langsung menutup tab atau berpindah halaman detik itu juga - tanpa ini,
    // kunjungan yang paling singkat (justru yang paling sering) hilang.
    void fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Statistik gagal terkirim tidak boleh terlihat oleh pengunjung.
    });
  }, [pathname]);

  return null;
}
