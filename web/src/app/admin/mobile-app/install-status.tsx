"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";

type CheckState = "memeriksa" | "ok" | "gagal";

interface Checks {
  serviceWorker: CheckState;
  manifestToko: CheckState;
  manifestAdmin: CheckState;
  standalone: boolean;
}

function Row({ state, label, detail }: { state: CheckState; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">
        {state === "memeriksa" && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        {state === "ok" && <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />}
        {state === "gagal" && <CircleAlert className="size-4 text-destructive" aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">
          {state === "memeriksa" ? "Memeriksa..." : detail}
        </span>
      </span>
    </li>
  );
}

/**
 * Pemeriksaan cepat: apakah app ini benar-benar bisa dipasang dari perangkat
 * yang sedang dipakai membuka halaman ini.
 *
 * Ada di sini, bukan di dokumentasi, karena tiga penyebab tersering gagalnya
 * pemasangan tidak menampilkan error di mana pun — service worker yang tidak
 * terdaftar, manifest yang dibalas HTML (mis. tertelan mode maintenance), dan
 * kondisi bahwa halamannya memang sudah berjalan sebagai app terpasang.
 */
export function InstallStatus() {
  const [checks, setChecks] = useState<Checks>({
    serviceWorker: "memeriksa",
    manifestToko: "memeriksa",
    manifestAdmin: "memeriksa",
    standalone: false,
  });

  useEffect(() => {
    let alive = true;

    async function checkManifest(url: string): Promise<CheckState> {
      try {
        // credentials: "omit" MENIRU CARA BROWSER SUNGGUHAN mengambil manifest.
        //
        // Ini bukan detail sepele: dengan `same-origin` bawaan fetch, cookie
        // sesi admin ikut terkirim dan manifest admin akan tampak sehat walau
        // sebenarnya digerbang login - persis kondisi yang membuat pemasangan
        // gagal di HP tanpa satu pun tanda di sini.
        const res = await fetch(url, { cache: "no-store", credentials: "omit" });
        if (!res.ok) return "gagal";
        // Isinya diurai, bukan cuma dicek status 200. Rewrite mode maintenance
        // membalas HTTP 200 berisi HTML — status saja tidak membedakannya dari
        // manifest yang benar.
        const data = (await res.json()) as { icons?: unknown[] };
        return Array.isArray(data.icons) && data.icons.length > 0 ? "ok" : "gagal";
      } catch {
        return "gagal";
      }
    }

    async function run() {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in window.navigator && window.navigator.standalone === true);

      let serviceWorker: CheckState = "gagal";
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration("/");
          serviceWorker = reg ? "ok" : "gagal";
        } catch {
          serviceWorker = "gagal";
        }
      }

      const [manifestToko, manifestAdmin] = await Promise.all([
        checkManifest("/manifest.webmanifest"),
        checkManifest("/admin/app.webmanifest"),
      ]);

      if (alive) setChecks({ serviceWorker, manifestToko, manifestAdmin, standalone });
    }

    void run();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Status pemasangan</h2>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">
        Diperiksa dari browser yang sedang kamu pakai sekarang.
      </p>

      <ul className="space-y-3">
        <Row
          state={checks.serviceWorker}
          label="Service worker aktif"
          detail={
            checks.serviceWorker === "ok"
              ? "Terdaftar. Syarat tombol Install di Chrome Android terpenuhi."
              : "Belum terdaftar. Muat ulang halaman sekali lagi; kalau tetap begini, browser ini memblokirnya (mode penyamaran / kebijakan perangkat)."
          }
        />
        <Row
          state={checks.manifestToko}
          label="Manifest aplikasi Toko"
          detail={
            checks.manifestToko === "ok"
              ? "Terbaca dengan benar di /manifest.webmanifest."
              : "Tidak terbaca. Kalau mode maintenance sedang menyala, matikan dulu lalu periksa lagi."
          }
        />
        <Row
          state={checks.manifestAdmin}
          label="Manifest aplikasi Admin"
          detail={
            checks.manifestAdmin === "ok"
              ? "Terbaca dengan benar di /admin/app.webmanifest."
              : "Tidak terbaca. Coba muat ulang halaman ini."
          }
        />
      </ul>

      <div className="mt-4 border-t pt-4">
        {checks.standalone ? (
          <p className="text-xs text-muted-foreground">
            Halaman ini sedang dibuka DARI app yang sudah terpasang. Tombol pasang tidak ditampilkan.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <InstallButton label="Pasang aplikasi Admin" />
            <p className="text-xs text-muted-foreground">
              Tombol muncul kalau browser ini mendukungnya. Di Safari iOS, tombolnya membuka panduan.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
