// Menerjemahkan pesan mentah provider jadi SEBAB yang bisa ditindaklanjuti.
//
// Alasannya: pesan provider itu apa adanya dan tidak seragam ("IP Anda tidak
// kami kenali: 18.138.233.188", "Saldo tidak cukup", "Produk sedang gangguan"),
// jadi admin harus menebak sendiri apakah yang rusak itu KODE KITA, SALDO
// PROVIDER, atau KONFIGURASI AKUN. Tebakan itu memakan waktu tepat pada saat
// order pelanggan sedang gagal.
//
// Klasifikasi berbasis POLA PESAN, bukan `rc`: Digiflazz memakai rc yang sama
// ("01"/"02") untuk sebab yang sangat berbeda, sementara teks pesannya justru
// konsisten. Kalau tidak ada pola yang cocok, jujur kembalikan "unknown" -
// menebak sebab yang salah lebih berbahaya daripada mengaku tidak tahu.

export type FailureCategory =
  | "ip_not_whitelisted"
  | "insufficient_balance"
  | "product_issue"
  | "invalid_target"
  | "duplicate"
  | "unknown";

export interface FailureDiagnosis {
  category: FailureCategory;
  /** Satu kalimat: apa yang sebenarnya terjadi. */
  label: string;
  /** Apa yang harus DIKERJAKAN admin. Kosong kalau tidak diketahui. */
  action: string;
  /** true = perlu tindakan admin di luar aplikasi (bukan bug kode kita). */
  actionable: boolean;
}

const PATTERNS: { category: FailureCategory; test: RegExp; label: string; action: string }[] = [
  {
    category: "ip_not_whitelisted",
    test: /ip anda tidak kami kenali|ip tidak dikenali|unrecognized ip|ip not (allowed|recognized)/i,
    label: "IP server belum terdaftar di provider",
    action:
      "Daftarkan IP yang disebut di pesan ke whitelist Digiflazz (Atur Akun → IP Whitelist). " +
      "Catatan: IP Vercel BERUBAH-UBAH, jadi whitelist satu IP tidak akan bertahan lama — butuh IP keluar yang tetap.",
  },
  {
    category: "insufficient_balance",
    test: /saldo (anda )?(tidak|belum) (cukup|mencukupi)|insufficient balance|saldo kurang/i,
    label: "Saldo provider tidak cukup",
    action: "Top up saldo Digiflazz, lalu tekan Coba Lagi pada order ini.",
  },
  {
    category: "product_issue",
    test: /gangguan|sedang tidak tersedia|produk (kosong|nonaktif|tidak aktif)|out of stock|seller.*(tutup|offline)/i,
    label: "Produk sedang bermasalah di sisi provider",
    action: "Tunggu provider pulih, atau alihkan SKU ke provider lain di Produk & Harga.",
  },
  {
    category: "invalid_target",
    test: /(nomor|tujuan|customer no|id).*(salah|tidak valid|invalid|tidak ditemukan)|format.*salah/i,
    label: "Nomor/ID tujuan ditolak provider",
    action: "Periksa data tujuan yang diisi pembeli. Kalau memang salah, refund order ini.",
  },
  {
    category: "duplicate",
    test: /duplicate|ref.?id.*(sudah|already)|transaksi.*(sudah ada|duplikat)/i,
    label: "Ref ID dianggap duplikat oleh provider",
    action: "Cek dulu apakah transaksi sebelumnya sudah berhasil sebelum mengirim ulang — jangan retry buta.",
  },
];

export function diagnoseFailure(message: string | null | undefined): FailureDiagnosis {
  const text = (message ?? "").trim();
  if (!text) {
    return {
      category: "unknown",
      label: "Provider tidak memberi pesan",
      action: "Buka respons mentah di bawah untuk melihat data lengkap dari provider.",
      actionable: false,
    };
  }
  for (const p of PATTERNS) {
    if (p.test.test(text)) {
      return { category: p.category, label: p.label, action: p.action, actionable: true };
    }
  }
  return {
    category: "unknown",
    label: "Sebab belum dikenali",
    action: "Buka respons mentah di bawah — kalau polanya berulang, tambahkan ke lib/order/failure-reason.ts.",
    actionable: false,
  };
}
