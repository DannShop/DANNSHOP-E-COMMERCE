// Service worker DannShop — sengaja hampir kosong.
//
// ⚠️ BACA INI SEBELUM MENAMBAH CACHE APA PUN DI SINI.
//
// Ini aplikasi uang. Service worker yang rajin menyimpan HTML atau respons API
// akan menyajikan saldo basi, harga basi, dan status pesanan basi — kelas bug
// yang tidak menimbulkan error di mana pun dan baru ketahuan dari pembeli yang
// uangnya sudah keluar. Karena itu berkas ini HANYA menyimpan satu halaman
// offline statis. Semua permintaan lain diteruskan apa adanya ke jaringan.
//
// Lalu kenapa dipasang sama sekali? Karena Chrome di Android mensyaratkan
// adanya service worker dengan penangan `fetch` sebelum mau menawarkan
// "Install app". Tanpa berkas ini, app-nya tidak bisa dipasang.

const CACHE = "dannshop-offline-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // cache: "reload" melewati cache HTTP browser, supaya yang tersimpan
      // benar-benar versi dari jaringan dan bukan salinan lama.
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Hanya navigasi (memuat halaman) yang ditangani. Permintaan lain — data API,
  // Server Action, gambar, chunk JS — tidak disentuh sama sekali: tanpa
  // respondWith(), browser menanganinya persis seperti tidak ada service worker.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        // Jaringan mati. Halaman offline yang tersimpan bisa saja dari deploy
        // yang lebih lama, dan itu tidak apa-apa: halaman itu sengaja dibuat
        // statis tanpa data maupun interaksi, jadi versi lamanya tidak pernah
        // bisa menampilkan sesuatu yang keliru.
        const cache = await caches.open(CACHE);
        const cached = await cache.match(OFFLINE_URL);
        return cached ?? Response.error();
      }
    })(),
  );
});
