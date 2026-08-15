"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan /sw.js. Dipasang sekali di layout ROOT.
 *
 * Pendaftaran ditunda sampai `load` dengan sengaja: mengunduh & memasang service
 * worker berebut bandwidth dengan pemuatan halaman pertama, dan tidak ada satu
 * pun bagian aplikasi ini yang menunggu service worker untuk berfungsi.
 *
 * Kegagalan ditelan diam-diam. Service worker di sini murni pelengkap (halaman
 * offline + syarat tombol Install di Chrome Android); browser yang menolaknya —
 * mode penyamaran, Firefox private, kebijakan perusahaan — harus tetap memakai
 * situsnya seperti biasa tanpa melihat error apa pun.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
