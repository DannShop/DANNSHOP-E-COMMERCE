import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Lingkungan untuk tes komponen. Hanya dimuat oleh project "components"
// (lihat vitest.config.ts) - tes unit di Node tidak menanggung biayanya.

// cleanup dipanggil MANUAL karena `globals` tidak diaktifkan di repo ini.
// Testing Library hanya memasang pembersih otomatis kalau menemukan afterEach
// global; tanpa ini, komponen dari tes sebelumnya menumpuk di dokumen yang sama
// dan query seperti getByRole mulai menemukan dua elemen yang cocok.
afterEach(cleanup);

// ===== Tambalan jsdom =====
//
// jsdom mengimplementasikan DOM, bukan mesin tata letak. Base UI (lewat
// floating-ui) memakai API pengukuran di bawah ini untuk memposisikan popup,
// dan ketiadaannya muncul sebagai "ReferenceError: X is not defined" di tengah
// render - bukan sebagai kegagalan yang menjelaskan dirinya sendiri.
//
// Yang ditambal SENGAJA cuma yang tidak ada sama sekali di jsdom. Nilai
// baliknya nol/kosong dan itu tidak apa-apa: yang diuji di sini apakah
// komponennya RENDER dan bereaksi, bukan apakah popupnya jatuh di koordinat
// yang benar - hal terakhir itu ranah mata manusia, bukan jsdom.

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): [] {
    return [];
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??=
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// matchMedia dipakai next-themes dan komponen apa pun yang membaca preferensi
// tema/gerak. Bawaannya "tidak cocok" supaya tes berjalan pada mode terang dan
// animasi penuh, keadaan yang sama untuk setiap tes.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof matchMedia;

// Base UI memanggil keduanya saat memindahkan fokus ke dalam popup.
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
HTMLElement.prototype.releasePointerCapture ??= function releasePointerCapture() {};
HTMLElement.prototype.hasPointerCapture ??= function hasPointerCapture() {
  return false;
};

// Menahan peringatan act() dari Base UI yang menjadwalkan transisi popup di
// luar kendali tes. Sengaja TIDAK membisukan console.error sepenuhnya -
// error React yang sesungguhnya (termasuk komponen yang melempar) tetap harus
// terlihat, karena justru itulah yang dicari tes-tes ini.
const realError = console.error;
vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("not wrapped in act(")) return;
  realError(...args);
});
