// Skrip pembuka layar pembuka. Dipasang di <head>, dijalankan SEBELUM body
// dicat pertama kali.
//
// Kenapa skrip inline dan bukan komponen React biasa: keduanya hal yang harus
// diketahui SEBELUM piksel pertama muncul, dan React baru bisa menjawabnya
// setelah hidrasi.
//
//  - Apakah halaman ini berjalan sebagai app terpasang? `display-mode` hanya
//    bisa dibaca di browser, dan Safari iOS versi lama tidak mendukungnya sama
//    sekali - ia memakai `navigator.standalone` miliknya sendiri. Server tidak
//    punya cara mengetahui keduanya.
//  - App yang mana, Toko atau Admin? Layout root membungkus dua-duanya dan
//    layout di Next.js tidak menerima pathname. Yang tahu pathname pada saat
//    itu cuma browser.
//
// Kegagalannya sengaja tidak berbunyi: kalau skrip ini tidak jalan, atributnya
// tidak terpasang, layar pembukanya tidak pernah muncul, dan aplikasinya jalan
// seperti biasa. Itu hasil yang benar - ini lapisan kosmetik.
//
// ⚠️ <html> di layout root memakai suppressHydrationWarning. Itu WAJIB tetap
// ada: skrip ini menambah atribut ke <html> sebelum React membandingkannya
// dengan hasil render server.

/** Berapa lama sebelum pengaman lapis kedua memaksa layar pembuka pergi. */
const FORCE_HIDE_MS = 2500;

const BOOT = `(function(){var d=document.documentElement;
try{var m=window.matchMedia;if((m&&(m('(display-mode: standalone)').matches||m('(display-mode: fullscreen)').matches||m('(display-mode: minimal-ui)').matches))||window.navigator.standalone===true){d.setAttribute('data-standalone','')}}catch(e){}
try{d.setAttribute('data-app',location.pathname.indexOf('/admin')===0?'admin':'toko')}catch(e){}
setTimeout(function(){d.setAttribute('data-splash','done')},${FORCE_HIDE_MS})})();`;

export function SplashBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}
