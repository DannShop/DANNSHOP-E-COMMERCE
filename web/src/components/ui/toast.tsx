"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pemberitahuan singkat di pojok kanan atas.
 *
 * Dibangun di atas token tema aplikasi, bukan memakai pustaka luar, karena
 * syaratnya justru "tidak merusak pemandangan": pustaka notifikasi datang dengan
 * warna, radius, dan font sendiri yang harus ditimpa satu per satu, dan setiap
 * naik versi timpaan itu bisa meleset lagi. Di sini warnanya memang warna panel
 * ini, jadi mode gelap benar tanpa usaha tambahan.
 *
 * DIPAKAI UNTUK KABAR BAIK YANG BOLEH HILANG. Pesan yang harus dibaca pelan-pelan
 * — nomor order yang menghalangi penghapusan, alamat IP yang harus didaftarkan —
 * TIDAK boleh lewat sini: sesuatu yang menghilang sendiri setelah beberapa detik
 * adalah tempat terburuk untuk menaruh keterangan yang paling mahal. Error tetap
 * tampil menempel pada tombol yang memicunya (lihat ActionMessage).
 */

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Milidetik. 0 = tidak hilang sendiri. */
  duration?: number;
}

interface ToastItem extends Required<ToastOptions> {
  id: number;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3_500,
  info: 4_500,
  // Lebih lama: kabar buruk butuh waktu baca lebih panjang, dan yang lewat sini
  // hanyalah error ringkas - yang panjang tetap tampil inline.
  error: 7_000,
};

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/**
 * Memunculkan toast. Aman dipanggil di komponen mana pun.
 *
 * Kalau providernya kebetulan tidak terpasang, fungsi ini TIDAK melempar,
 * melainkan diam. Notifikasi bersifat pelengkap - menjatuhkan seluruh halaman
 * hanya karena kabar "berhasil disimpan" tidak bisa ditampilkan adalah tukar
 * rugi yang buruk.
 */
export function useToast(): (options: ToastOptions) => void {
  const push = useContext(ToastContext);
  return useCallback(
    (options: ToastOptions) => {
      if (!push) return;
      push(options);
    },
    [push],
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  // Portal butuh `document`, yang tidak ada saat render di server.
  //
  // Dipakai useSyncExternalStore, BUKAN `useState(false)` + useEffect: pola
  // "mounted flag" lewat efek memicu render bertingkat yang tidak perlu (dan
  // ditolak aturan lint react-hooks/set-state-in-effect). Di sini snapshot
  // servernya `false` dan snapshot kliennya `true`, jadi React sendiri yang
  // mengurus perbedaannya tanpa satu pun setState.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const push = useCallback((options: ToastOptions) => {
    const tone = options.tone ?? "success";
    const id = nextId.current++;
    setToasts((prev) => [
      ...prev,
      { id, message: options.message, tone, duration: options.duration ?? DEFAULT_DURATION[tone] },
    ]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {mounted &&
        createPortal(
          <div
            // `pointer-events-none` di wadahnya supaya area kosong di kanan atas
            // tidak diam-diam menelan klik ke halaman di belakangnya; tiap kartu
            // menyalakannya kembali untuk dirinya sendiri.
            className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
            role="region"
            aria-label="Pemberitahuan"
          >
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Record<ToastTone, { ring: string; icon: string; Icon: typeof CheckCircle2 }> = {
  success: {
    ring: "ring-emerald-500/30",
    icon: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  error: { ring: "ring-destructive/40", icon: "text-destructive", Icon: TriangleAlert },
  info: { ring: "ring-sky-500/30", icon: "text-sky-600 dark:text-sky-400", Icon: Info },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const { ring, icon, Icon } = TONE_STYLE[toast.tone];

  // Hitungan mundur berhenti selama kursor menempel. Toast yang menghilang tepat
  // saat sedang dibaca adalah alasan utama orang membenci pola ini.
  useEffect(() => {
    if (toast.duration === 0 || paused) return;
    const timer = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, paused, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-200",
        ring,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", icon)} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Tutup pemberitahuan"
        className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
