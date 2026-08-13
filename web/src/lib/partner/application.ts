import { z } from "zod";

/**
 * Bentuk form pengajuan mitra + validasinya.
 *
 * Fungsi murni (nol DB, nol env) supaya bisa diuji unit, dan supaya SATU definisi
 * dipakai bersama oleh form di panel user, server action yang menyimpannya, dan
 * halaman tinjauan admin — daftar opsi yang disalin ke tiga tempat pasti melenceng.
 *
 * Isi fieldnya bukan karangan: mengikuti pola form pendaftaran H2H yang sudah
 * jadi standar distributor Indonesia (data usaha → PIC → data teknis → skala),
 * tapi SENGAJA memangkas seluruh blok dokumen legal (akta, NPWP, SPPKP, surat
 * pernyataan faktur pajak, upload KTP). Alasannya: blok itu ada untuk distributor
 * korporat PKP, dan mensyaratkannya di sini akan membunuh pendaftaran mitra kecil
 * yang justru target kita — sementara identitas dasar sudah kita punya karena
 * pemohon WAJIB sudah jadi member terdaftar sebelum formnya bisa dibuka.
 */

export const BUSINESS_TYPES = [
  { value: "PERORANGAN", label: "Perorangan / belum berbadan hukum" },
  { value: "CV", label: "CV" },
  { value: "PT", label: "PT" },
  { value: "KOPERASI", label: "Koperasi" },
  { value: "LAINNYA", label: "Lainnya" },
] as const;

/**
 * Rentang volume, bukan angka bebas. Angka bebas dari calon mitra hampir selalu
 * optimistis dan tidak bisa dibandingkan antar pengajuan; rentang membuat admin
 * bisa mengurutkan antrean tanpa menafsirkan "banyak".
 */
export const MONTHLY_VOLUMES = [
  { value: "under_100", label: "< 100 transaksi/bulan" },
  { value: "100_1000", label: "100 – 1.000 transaksi/bulan" },
  { value: "1000_5000", label: "1.000 – 5.000 transaksi/bulan" },
  { value: "5000_20000", label: "5.000 – 20.000 transaksi/bulan" },
  { value: "over_20000", label: "> 20.000 transaksi/bulan" },
] as const;

/**
 * Platform yang dipakai partner. Menentukan seberapa banyak bantuan integrasi
 * yang perlu disiapkan: "aplikasi H2H pihak ketiga" berarti format requestnya
 * sudah dipatok vendor mereka dan kemungkinan besar butuh penyesuaian di sisi
 * kita, sedangkan "sistem sendiri" berarti mereka bisa mengikuti dokumen apa adanya.
 */
export const PARTNER_PLATFORMS = [
  { value: "sistem_sendiri", label: "Sistem/website sendiri" },
  { value: "aplikasi_h2h", label: "Aplikasi H2H pihak ketiga (Otomax, IRS, dsb)" },
  { value: "wordpress", label: "WordPress / plugin toko" },
  { value: "bot_chat", label: "Bot WhatsApp/Telegram" },
  { value: "belum_ada", label: "Belum ada, masih akan dibangun" },
] as const;

export const MONTHLY_VOLUME_VALUES = MONTHLY_VOLUMES.map((v) => v.value);
export const PARTNER_PLATFORM_VALUES = PARTNER_PLATFORMS.map((p) => p.value);

export function labelForBusinessType(value: string): string {
  return BUSINESS_TYPES.find((t) => t.value === value)?.label ?? value;
}
export function labelForMonthlyVolume(value: string): string {
  return MONTHLY_VOLUMES.find((v) => v.value === value)?.label ?? value;
}
export function labelForPlatform(value: string | null): string {
  if (!value) return "—";
  return PARTNER_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

/**
 * Daftar IP dipisah koma, format identik dengan PartnerAccount.ipWhitelist —
 * nilainya disalin apa adanya saat pengajuan disetujui.
 *
 * Divalidasi ketat di sini karena kesalahan ketik di kolom ini menghasilkan
 * kegagalan yang paling sulit didiagnosis di seluruh API: panggilan pertama
 * partner ditolak rc 12 padahal signature, saldo, dan SKU-nya sudah benar.
 * Ini persis kelas masalah rc 45 Digiflazz yang sudah menghabiskan waktu kita
 * sendiri dari sisi sebaliknya (lihat docs/08-IP-TETAP-DIGIFLAZZ.md).
 */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function parseIpList(raw: string): { ok: true; ips: string[] } | { ok: false; error: string } {
  const ips = raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ips.length > 10) return { ok: false, error: "Maksimal 10 alamat IP." };
  for (const ip of ips) {
    // IPv6 dibiarkan lewat apa adanya: extractIp() bisa mengembalikannya, dan
    // menolak bentuk yang sah cuma akan mengunci partner di luar tanpa alasan.
    // Yang divalidasi ketat hanya bentuk yang MENYERUPAI IPv4 — di situlah salah
    // ketik benar-benar terjadi ("192.168.1" / "192.168.1.256").
    if (/^[\d.]+$/.test(ip) && !IPV4.test(ip)) {
      return { ok: false, error: `"${ip}" bukan alamat IPv4 yang valid.` };
    }
    if (ip.length > 45) return { ok: false, error: `"${ip.slice(0, 20)}…" terlalu panjang untuk sebuah alamat IP.` };
  }
  return { ok: true, ips };
}

/**
 * URL callback dibatasi https di production — bukan formalitas: body callback
 * membawa nomor tujuan customer, dan http polos berarti data itu melintas
 * terbuka. localhost dikecualikan supaya partner bisa mengetes integrasinya.
 *
 * Aturan yang SAMA sudah berlaku di actions/partners.ts; dipusatkan di sini
 * supaya kedua jalur (pengajuan mandiri & pembuatan oleh admin) tidak bisa
 * berbeda diam-diam.
 */
export function isAcceptableCallbackUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const partnerApplicationSchema = z.object({
  businessName: z.string().trim().min(3, "Nama usaha minimal 3 karakter").max(120),
  businessType: z.enum(["PERORANGAN", "CV", "PT", "KOPERASI", "LAINNYA"], {
    message: "Pilih bentuk badan usaha",
  }),
  businessCity: z.string().trim().min(2, "Kota/kabupaten wajib diisi").max(80),
  websiteUrl: optionalText(300).refine((v) => v === null || isAcceptableUrl(v), {
    message: "Website harus berupa URL lengkap, contoh: https://tokoanda.com",
  }),

  picName: z.string().trim().min(3, "Nama penanggung jawab minimal 3 karakter").max(120),
  // Nomor WhatsApp: 8–20 digit setelah normalisasi. Tidak dipaksa ke format +62
  // karena partner boleh saja memakai nomor luar negeri, tapi karakter selain
  // digit/plus/spasi/strip ditolak supaya kolomnya tetap bisa di-klik CS.
  picPhone: z
    .string()
    .trim()
    .min(8, "Nomor WhatsApp terlalu pendek")
    .max(24)
    .regex(/^[+\d][\d\s-]{7,23}$/, "Nomor WhatsApp hanya boleh angka, spasi, strip, dan awalan +"),
  picRole: optionalText(80),

  platform: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || PARTNER_PLATFORM_VALUES.includes(v as (typeof PARTNER_PLATFORM_VALUES)[number]), {
      message: "Platform tidak dikenal",
    }),
  serverIps: optionalText(500).refine(
    (v) => {
      if (v === null) return true;
      return parseIpList(v).ok;
    },
    { message: "Daftar IP tidak valid. Pisahkan dengan koma, contoh: 103.28.14.5, 103.28.14.6" },
  ),
  callbackUrl: optionalText(500).refine((v) => v === null || isAcceptableCallbackUrl(v), {
    message: "URL callback harus https (http hanya boleh untuk localhost saat pengetesan)",
  }),

  monthlyVolume: z
    .string()
    .trim()
    .refine((v) => MONTHLY_VOLUME_VALUES.includes(v as (typeof MONTHLY_VOLUME_VALUES)[number]), {
      message: "Pilih estimasi volume transaksi",
    }),
  notes: optionalText(1000),
});

export type PartnerApplicationInput = z.infer<typeof partnerApplicationSchema>;

function isAcceptableUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** Normalisasi daftar IP jadi bentuk kanonik "a, b, c" untuk disimpan. */
export function normalizeIpList(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = parseIpList(raw);
  if (!parsed.ok || parsed.ips.length === 0) return null;
  return parsed.ips.join(", ");
}

/**
 * Usulan username partner dari nama usaha, untuk mengisi awal form persetujuan
 * admin. Cuma usulan — admin tetap bisa menggantinya, karena username ini masuk
 * ke dalam string yang di-hash md5 dan tidak bisa diubah tanpa mematikan
 * integrasi partner.
 *
 * Aturannya menyamai usernameSchema di actions/partners.ts: huruf, angka,
 * garis bawah, strip; 3–40 karakter.
 */
export function suggestPartnerUsername(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  // Nama usaha yang seluruhnya non-latin (mis. aksara lain) bisa menyisakan
  // string kosong; jangan pernah mengusulkan username yang pasti ditolak.
  return base.length >= 3 ? base : "";
}

export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu ditinjau",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};
