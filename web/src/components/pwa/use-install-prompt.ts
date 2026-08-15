"use client";

import { useCallback, useEffect, useState } from "react";

// Event yang dipakai Chromium untuk menawarkan pemasangan. Belum masuk lib DOM
// TypeScript standar (masih usulan), jadi bentuknya ditulis di sini.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** true kalau halaman ini sedang berjalan sebagai app terpasang, bukan tab browser. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS tidak mendukung display-mode dan memakai propertinya sendiri.
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPad modern menyamar sebagai macOS; yang membedakannya layar sentuh.
  const isIos = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Semua peramban di iOS memakai mesin WebKit yang sama, dan hanya Safari yang
  // punya menu "Tambahkan ke Layar Utama". Chrome/Firefox di iOS tidak bisa
  // memasang app sama sekali, jadi jangan tampilkan ajakan yang tak bisa diikuti.
  const isRealSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isRealSafari;
}

export interface InstallPrompt {
  /**
   * false = jangan render apa pun.
   *
   * Dipakai bersama oleh tombol DAN kartu ajakan di /account. Kalau tiap
   * pemakai mendeteksinya sendiri, cepat atau lambat ada yang merender bingkai
   * kartu kosong di sekeliling tombol yang memutuskan untuk tidak tampil.
   */
  available: boolean;
  /** true = pemasangan hanya bisa lewat panduan manual (Safari iOS). */
  needsManualGuide: boolean;
  /** Memanggil prompt bawaan browser. Tidak melakukan apa-apa di iOS. */
  promptInstall: () => Promise<void>;
}

export function useInstallPrompt(): InstallPrompt {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Ditebak "sudah terpasang" pada render pertama supaya HTML server & klien
  // identik: deteksi standalone/iOS hanya bisa dilakukan di browser, dan
  // menebak "belum terpasang" akan membuat tombolnya berkedip muncul lalu
  // hilang pada setiap muat halaman di app yang sudah terpasang.
  const [installed, setInstalled] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deteksi kemampuan browser hanya bisa dilakukan setelah mount, pola yang sama dipakai ThemeSwitch di admin-shell
    setInstalled(isStandalone());
    setIos(isIosSafari());

    const onBeforeInstall = (e: Event) => {
      // preventDefault menahan mini-infobar bawaan Chrome supaya pemasangan
      // dipicu tombol kita saja - kalau tidak, dua ajakan muncul bersamaan.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferred;
    if (!event) return;
    // Prompt bawaan hanya boleh dipakai SEKALI. Event-nya dibuang lebih dulu
    // supaya klik kedua tidak memanggil prompt yang sudah hangus (yang melempar
    // dan tidak menampilkan apa-apa).
    setDeferred(null);
    try {
      await event.prompt();
    } catch {
      // Dibatalkan browser - tidak ada yang perlu disampaikan ke user.
    }
  }, [deferred]);

  return {
    available: !installed && (ios || deferred !== null),
    needsManualGuide: ios,
    promptInstall,
  };
}
