import { headers } from "next/headers";

/**
 * Alamat dasar aplikasi seperti yang benar-benar dilihat pengunjung.
 *
 * Dibaca dari header request duluan, BUKAN dari `NEXT_PUBLIC_APP_URL`, karena
 * yang memakai fungsi ini adalah dokumentasi & contoh perintah untuk mitra:
 * URL yang salah di situ menghasilkan integrasi yang gagal dengan pesan yang
 * tidak menyinggung URL sama sekali. Header host selalu benar untuk domain apa
 * pun yang sedang dibuka (produksi, preview Vercel, atau localhost), sementara
 * env var hanya benar kalau seseorang ingat memperbaruinya.
 *
 * Env var tetap dipakai sebagai cadangan untuk konteks tanpa request (job/cron).
 */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}
