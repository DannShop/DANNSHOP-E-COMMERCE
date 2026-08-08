// Snap.js menempel di window sebagai global, tanpa paket npm resmi. Deklarasi
// ini dulu sempat dihapus (commit 05bf55d) saat integrasi pindah ke Core API,
// dan dihidupkan lagi HANYA untuk mode fallback Snap.
//
// Callback pembayaran sengaja tidak diwajibkan: halaman invoice & deposit sudah
// polling status + lazy reconcile (lib/payment/reconcile.ts), jadi status PAID
// tetap terbaca walau pembeli menutup popup, membayar dari perangkat lain, atau
// callback-nya tidak pernah jalan. Menggantungkan settlement pada callback
// browser adalah cara klasik kehilangan pembayaran yang sudah dibayar.

interface SnapPayOptions {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}

interface SnapGlobal {
  pay: (token: string, options?: SnapPayOptions) => void;
  hide?: () => void;
}

interface Window {
  snap?: SnapGlobal;
}
