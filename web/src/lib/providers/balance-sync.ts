import type { BalanceAlertStatus as PrismaBalanceAlertStatus, ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { decideBalanceAlertTransition, type BalanceAlertStatus } from "./balance-alert";
import { formatBalanceAlertMessage, notifyTelegram } from "@/lib/notify/telegram";

// Menerapkan state machine alert saldo SETELAH saldo terbaru diketahui.
//
// KENAPA ADA. Sebelumnya evaluasi ini cuma hidup di dalam job cron
// `check-provider-balance`, sementara DUA jalur lain juga mengubah data yang
// sama tanpa pernah mengevaluasinya:
//
//   1. Tombol "Cek Saldo" di /admin/providers memperbarui `balance` tapi tidak
//      pernah menyentuh `balanceAlertStatus`.
//   2. Menyimpan ambang batas MERESET `balanceAlertStatus` ke "OK" tanpa
//      membandingkannya dengan saldo yang sudah tersimpan.
//
// Akibat gabungannya: admin menyetel ambang Rp 10.000 saat saldo tinggal Rp 73,
// lalu layar dengan tenang menampilkan "Sehat" — dan tidak ada apa pun yang
// mengoreksinya sampai cron berikutnya berjalan (bisa satu jam kemudian). Untuk
// fitur yang seluruh gunanya adalah memberi peringatan dini, diam selama satu jam
// sambil menampilkan status yang salah adalah kegagalan total.
//
// Karena itu ketiga jalur sekarang memanggil fungsi INI, bukan menyalin
// potongan logikanya masing-masing.

/**
 * ATURAN YANG TIDAK BOLEH DILANGGAR: kalau status BERUBAH, alert-nya WAJIB ikut
 * dikirim.
 *
 * Sempat terpikir untuk membisukan Telegram pada jalur yang dipicu admin (pola
 * `alertOnFailure=false` di fulfillment.ts). Itu keliru di sini, dan bentuk
 * kelirunya halus: state machine ini EDGE-TRIGGERED. Kalau tombol manual
 * memindahkan status OK→LOW tanpa mengirim apa pun, siklus cron berikutnya akan
 * melihat status sudah LOW, menyimpulkan "tidak ada perubahan", dan alert untuk
 * penurunan saldo itu HILANG SELAMANYA. Notifikasi yang terasa berlebihan jauh
 * lebih murah daripada notifikasi saldo menipis yang tidak pernah datang.
 */
export async function applyBalanceAlert(provider: {
  id: string;
  key: ProviderKey;
  displayName: string;
  minBalanceAlert: bigint | null;
  balanceAlertStatus: PrismaBalanceAlertStatus;
}, balance: bigint): Promise<void> {
  // Ambang kosong = admin sengaja mematikan alert untuk provider ini.
  if (provider.minBalanceAlert === null) return;

  const transition = decideBalanceAlertTransition(
    balance,
    provider.minBalanceAlert,
    provider.balanceAlertStatus as BalanceAlertStatus,
  );
  if (transition.alert === "none") return;

  // Kirim dulu, baru persist - kalau pengiriman gagal (jaringan/token salah),
  // status DB TIDAK diubah supaya evaluasi berikutnya mencoba ulang alert yang
  // sama dari status lama. Perilaku ini dipindahkan apa adanya dari runner.ts.
  const outcome = await notifyTelegram(
    "provider_balance",
    formatBalanceAlertMessage({
      displayName: provider.displayName,
      balance,
      threshold: provider.minBalanceAlert,
      recovered: transition.alert === "recovered",
    }),
  );

  // "disabled" (admin mematikan kategori notifikasi ini) dianggap tuntas - hanya
  // "failed" yang menahan transisi. Kalau tidak dibedakan, mematikan notifikasi
  // saldo akan membekukan state machine-nya selamanya di status lama.
  if (outcome === "failed") return;

  // CAS: hanya menulis kalau status belum diubah proses lain sejak dibaca.
  await db.providerConfig.updateMany({
    where: { key: provider.key, balanceAlertStatus: provider.balanceAlertStatus },
    data: { balanceAlertStatus: transition.newStatus },
  });
}
