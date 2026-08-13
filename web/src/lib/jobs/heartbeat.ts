import { db } from "@/lib/db";

/**
 * Detak terakhir /api/cron/tick.
 *
 * Ada karena satu insiden nyata: cron proyek ini mati **empat hari** tanpa satu
 * pun gejala yang terlihat di mana pun. Tabel Job tidak bisa menjawabnya —
 * "tidak ada job yang jalan" terlihat sama persis dengan "tidak ada job yang
 * perlu dijalankan", dan job yang overdue pun baru kelihatan kalau ada yang
 * sengaja membuka Monitoring Job dan memperhatikan kolom runAt.
 *
 * Yang hilang adalah bukti POSITIF bahwa penjadwalnya masih hidup. Satu baris
 * SiteSetting sudah cukup: ditulis setiap tick yang lolos autentikasi, dibaca
 * dashboard admin. Sengaja memakai SiteSetting (bukan tabel/kolom baru) supaya
 * tidak menambah migrasi untuk satu nilai tunggal — pola yang sama sudah
 * dipakai konfigurasi payment & appearance.
 */
export const CRON_HEARTBEAT_KEY = "cron_last_tick_at";

/**
 * Ambang "cron dianggap mati". Cron proyek ini dijadwalkan tiap menit, jadi 15
 * menit berarti belasan tick berturut-turut terlewat — cukup longgar untuk
 * menahan cron eksternal yang telat atau satu deploy yang sedang berjalan,
 * cukup ketat untuk menangkap masalah di hari yang sama, bukan di hari keempat.
 */
export const CRON_STALE_MINUTES = 15;

/**
 * TIDAK PERNAH melempar. Kegagalan mencatat detak tidak boleh menggagalkan tick
 * yang sebenarnya berhasil menjalankan job — itu akan mengubah alat diagnosis
 * jadi sumber masalahnya sendiri.
 */
export async function recordCronHeartbeat(at: Date = new Date()): Promise<void> {
  try {
    const value = at.toISOString();
    await db.siteSetting.upsert({
      where: { key: CRON_HEARTBEAT_KEY },
      create: { key: CRON_HEARTBEAT_KEY, value },
      update: { value },
    });
  } catch (e) {
    console.error("recordCronHeartbeat: gagal mencatat detak cron", { error: e });
  }
}

export interface CronHealth {
  lastTickAt: Date | null;
  minutesSinceLastTick: number | null;
  /** true = belum pernah ada tick tercatat SAMA SEKALI (heartbeat baru dipasang, atau cron tidak pernah menyambung). */
  neverSeen: boolean;
  stale: boolean;
}

export function evaluateCronHealth(lastTickAt: Date | null, now: Date = new Date()): CronHealth {
  if (!lastTickAt) {
    // Belum pernah terlihat = dianggap MATI, bukan "belum ada data". Menganggapnya
    // sehat berarti keadaan terburuk (cron tidak pernah tersambung sama sekali)
    // justru yang paling sunyi.
    return { lastTickAt: null, minutesSinceLastTick: null, neverSeen: true, stale: true };
  }
  const minutes = Math.floor((now.getTime() - lastTickAt.getTime()) / 60_000);
  return {
    lastTickAt,
    minutesSinceLastTick: minutes,
    neverSeen: false,
    stale: minutes >= CRON_STALE_MINUTES,
  };
}

export async function getCronHealth(now: Date = new Date()): Promise<CronHealth> {
  try {
    const row = await db.siteSetting.findUnique({ where: { key: CRON_HEARTBEAT_KEY } });
    const parsed = row ? new Date(row.value) : null;
    return evaluateCronHealth(parsed && !Number.isNaN(parsed.getTime()) ? parsed : null, now);
  } catch (e) {
    console.error("getCronHealth: gagal membaca detak cron", { error: e });
    // Dashboard yang gagal membaca status TIDAK boleh menampilkan "sehat".
    return { lastTickAt: null, minutesSinceLastTick: null, neverSeen: true, stale: true };
  }
}
