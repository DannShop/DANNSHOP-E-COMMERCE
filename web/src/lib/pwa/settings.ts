import { cache } from "react";
import { db } from "@/lib/db";
import { defaultPwaSettings, parsePwaSettings, SETTINGS_KEY, type PwaSettings } from "@/lib/pwa/config";

// Numpang tabel SiteSetting yang sudah ada (satu baris berisi JSON), pola persis
// seperti storefront_appearance & invoice_branding. Nol migrasi Prisma.

export const getPwaSettings = cache(async (): Promise<PwaSettings> => {
  // Dibungkus try/catch sampai ke query-nya, bukan cuma JSON.parse.
  //
  // Alasannya: pemanggil terbesar fungsi ini adalah route manifest, dan manifest
  // yang membalas 500 membuat app yang SUDAH terpasang di home screen gagal
  // memperbarui dirinya. Gangguan DB sesaat tidak boleh sampai ke sana - jatuh
  // ke identitas bawaan jauh lebih baik daripada tidak membalas apa pun.
  try {
    const row = await db.siteSetting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!row) return defaultPwaSettings();
    return parsePwaSettings(JSON.parse(row.value));
  } catch {
    return defaultPwaSettings();
  }
});

export async function savePwaSettings(settings: PwaSettings): Promise<void> {
  const value = JSON.stringify(settings);
  await db.siteSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value },
    create: { key: SETTINGS_KEY, value },
  });
}
