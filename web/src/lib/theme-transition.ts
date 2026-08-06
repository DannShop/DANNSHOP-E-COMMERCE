const TRANSITION_CLASS = "theme-transition";
/** Harus >= durasi transisi di globals.css (220ms) + sedikit jeda aman.
 *  Jangan dipanjangkan tanpa alasan: selama kelas ini terpasang, blur
 *  .glass-panel/.glass-card dibekukan, jadi makin panjang makin lama pula
 *  kaca kehilangan blur-nya. */
const TRANSITION_MS = 280;

let cleanupTimer: number | undefined;

// Kelas transisi sengaja cuma dipasang SELAMA pergantian tema (~0,5 detik),
// bukan permanen. Kalau dipasang permanen, setiap hover yang mengubah warna
// (tabel admin, tombol, baris menu) ikut melambat jadi 220ms dan UI terasa
// berat - padahal yang benar-benar butuh transisi panjang cuma momen
// light<->dark. Lihat aturan `.theme-transition` di globals.css.
export function withThemeTransition(apply: () => void): void {
  if (typeof document === "undefined") {
    apply();
    return;
  }

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    apply();
    return;
  }

  root.classList.add(TRANSITION_CLASS);
  apply();

  // Klik cepat berkali-kali: reset timer, jangan sampai kelas dilepas lebih
  // awal oleh timer dari klik sebelumnya sementara transisi baru masih jalan.
  if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(() => {
    root.classList.remove(TRANSITION_CLASS);
    cleanupTimer = undefined;
  }, TRANSITION_MS);
}
