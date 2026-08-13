import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export interface PartnerSession {
  userId: string;
  userName: string;
  userEmail: string;
  partnerId: string;
  username: string;
  isActive: boolean;
  callbackUrl: string | null;
  hasCallbackSecret: boolean;
  ipWhitelist: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * Gerbang portal mitra. SATU tempat yang tahu "siapa mitra yang sedang login",
 * dipakai layout maupun setiap server action self-service di bawah /mitra.
 *
 * Sengaja mengembalikan null (bukan redirect) supaya pemanggilnya yang memilih
 * jawaban yang tepat: layout mengarahkan ke halaman pengajuan, sedangkan server
 * action harus membalas ActionResult — server action yang me-redirect di tengah
 * jalan menghasilkan error yang tidak bisa dibaca user.
 *
 * Perhatikan bahwa akun NONAKTIF tetap dikembalikan, tidak diperlakukan seperti
 * bukan mitra. Mitra yang dinonaktifkan admin harus tetap bisa masuk untuk
 * melihat riwayat dan alasannya; mengunci mereka di luar hanya menghasilkan
 * tiket "portal saya hilang" yang tidak menjelaskan apa pun.
 */
export async function getPartnerSession(): Promise<PartnerSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const account = await db.partnerAccount.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      isActive: true,
      callbackUrl: true,
      callbackSecretEnc: true,
      ipWhitelist: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  if (!account) return null;

  return {
    userId: session.user.id,
    userName: session.user.name ?? "Mitra",
    userEmail: session.user.email ?? "",
    partnerId: account.id,
    username: account.username,
    isActive: account.isActive,
    callbackUrl: account.callbackUrl,
    // Hanya keberadaannya yang dibocorkan ke pemanggil; nilainya dibaca
    // terpisah dan hanya oleh halaman kredensial yang memang menampilkannya.
    hasCallbackSecret: account.callbackSecretEnc !== null,
    ipWhitelist: account.ipWhitelist,
    lastUsedAt: account.lastUsedAt,
    createdAt: account.createdAt,
  };
}
