"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import type { AndroidApkInfo } from "@/lib/pwa/config";

// Jenis perangkat tidak pernah berubah selama halaman terbuka, jadi tidak ada
// yang perlu dilanggan - subscribe-nya sengaja kosong dan stabil (di luar
// komponen) supaya tidak dibuat ulang tiap render.
const noopSubscribe = () => () => {};
const readIsAndroid = () => /android/i.test(navigator.userAgent);
// Di server tidak ada navigator, dan jawabannya HARUS `false`: render pertama
// wajib sama persis dengan yang dihasilkan server, kalau tidak React membuang
// seluruh pohonnya dan menyusun ulang (hydration mismatch).
const readIsAndroidOnServer = () => false;

/**
 * Tombol unduh berkas APK Android.
 *
 * Ditampilkan HANYA di Android. Di iPhone berkas .apk tidak bisa dipasang sama
 * sekali, dan di desktop tidak ada gunanya - menampilkannya di sana cuma
 * menawarkan sesuatu yang berakhir dengan kebingungan.
 *
 * Deteksinya di klien lewat useEffect, bukan dari User-Agent di server, karena
 * halaman pemanggilnya boleh saja di-cache: menentukan isi HTML dari
 * User-Agent berarti satu pengunjung Android bisa membuat versi ber-tombol
 * tersaji ke pengunjung iPhone berikutnya.
 */
export function DownloadApkCard({ apk }: { apk: AndroidApkInfo }) {
  const isAndroid = useSyncExternalStore(noopSubscribe, readIsAndroid, readIsAndroidOnServer);

  if (!isAndroid) return null;

  const sizeMb = apk.sizeBytes > 0 ? (apk.sizeBytes / (1024 * 1024)).toFixed(1) : null;
  const detail = [apk.version && `v${apk.version}`, sizeMb && `${sizeMb} MB`]
    .filter(Boolean)
    .join(" · ");

  return (
    <a
      href={apk.url}
      // download + rel: berkas ini dari domain Blob, bukan domain kita sendiri.
      // Tanpa rel, tab unduhan mewarisi akses ke window pembukanya.
      download
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-5 py-4 text-left transition-colors duration-200 ease-out hover:bg-foreground/[0.04]"
    >
      <span className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Download className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Unduh aplikasi Android</span>
          <span className="block text-xs text-muted-foreground">
            Berkas APK{detail ? ` (${detail})` : ""} — pasang langsung, tanpa Play Store.
          </span>
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium text-primary">Unduh</span>
    </a>
  );
}
