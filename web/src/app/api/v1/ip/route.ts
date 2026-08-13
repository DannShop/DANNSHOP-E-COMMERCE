import { extractIp } from "@/lib/rate-limit";
import { PARTNER_RC, partnerJson } from "@/lib/partner/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ip — memberi tahu pemanggil, IP berapa yang kami lihat.
 *
 * SATU-SATUNYA endpoint /api/v1/* yang tidak butuh autentikasi, dan itu
 * disengaja: gunanya justru untuk dipakai SEBELUM mitra punya integrasi yang
 * jalan. Tidak ada rahasia yang dibocorkan — jawabannya adalah alamat pemanggil
 * itu sendiri, yang memang sudah dia kirim ke kami untuk bisa sampai ke sini.
 *
 * Kenapa ini ada sama sekali: whitelist IP adalah penyebab kegagalan pertama
 * yang paling sering dan paling membingungkan di API mana pun bergaya ini.
 * Mitra mendaftarkan IP yang mereka lihat di browser atau di panel hosting,
 * padahal server mereka keluar lewat NAT dengan alamat yang sama sekali
 * berbeda — lalu panggilan pertamanya ditolak rc 12 dengan signature yang
 * sebenarnya sudah benar. Kita mengalami persis kelas masalah ini dari sisi
 * sebaliknya dengan Digiflazz rc 45 (lihat docs/08-IP-TETAP-DIGIFLAZZ.md), dan
 * pelajaran di sana persis sama: satu-satunya angka yang bisa dipercaya adalah
 * angka yang disebutkan oleh pihak yang menerima panggilan.
 *
 * Cara pakainya (dijalankan DARI SERVER mitra, bukan dari browser):
 *   curl https://dannshop.example.com/api/v1/ip
 */
export async function GET(request: Request) {
  return partnerJson({
    rc: PARTNER_RC.SUCCESS,
    message: "Berhasil",
    ip: extractIp(request.headers),
    note: "Ini alamat IP yang kami lihat dari pemanggil request ini. Jalankan dari server yang akan memanggil API — IP browser kamu hampir selalu berbeda.",
  });
}
