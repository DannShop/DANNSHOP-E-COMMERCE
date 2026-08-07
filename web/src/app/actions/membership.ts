"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export type ActionResult = { ok?: string; error?: string };

class InsufficientBalanceError extends Error {}

// Beli/perpanjang paket tier pakai saldo wallet. Satu-satunya cara member
// mendapat tier baru selain grant manual admin (actions/admin-membership.ts).
//
// Semantik "beli tier lain saat masih punya tier aktif": SISA WAKTU TIER LAMA
// TIDAK DIKONVERSI/DIKEMBALIKAN - membeli tier apa pun langsung menjadikannya
// tier aktif mulai sekarang (perilaku "upgrade mengganti", bukan akumulasi).
// Ini yang membuat sistemnya tetap sederhana (satu tier aktif per user, tidak
// ada antrean tier "nanti aktif setelah yang sekarang habis") - halaman
// /membership menampilkan sisa waktu tier saat ini dengan jelas SEBELUM
// tombol beli ditekan, supaya keputusan ini tidak mengejutkan user.
//
// Beli tier YANG SAMA selagi masih aktif memperpanjang expiresAt (menambah
// durationDays baru di atas sisa waktu yang ada), bukan mulai dari nol -
// member yang royal (beli Gold 3x berturut-turut) tidak dirugikan waktunya.
export async function purchaseTier(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Harus login untuk beli tier member." };
  const userId = session.user.id;

  const tierId = String(formData.get("tierId") ?? "");
  const tier = await db.membershipTier.findUnique({ where: { id: tierId } });
  if (!tier || !tier.isActive) return { error: "Paket tier tidak ditemukan atau sedang tidak tersedia." };

  const now = new Date();
  const current = await db.userMembership.findFirst({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
  });
  const baseStart = current && current.tierId === tier.id ? current.expiresAt : now;
  const expiresAt = new Date(baseStart.getTime() + tier.durationDays * 24 * 60 * 60 * 1000);

  try {
    await db.$transaction(async (tx) => {
      // Klaim atomik: decrement HANYA berhasil kalau balance masih cukup di
      // detik eksekusi ini (pola sama persis createBalanceOrder di
      // actions/checkout.ts) - mencegah race dua tab membeli tier "sekaligus"
      // dengan saldo yang cuma cukup untuk satu.
      const debited = await tx.wallet.updateMany({
        where: { userId, balance: { gte: tier.price } },
        data: { balance: { decrement: tier.price } },
      });
      if (debited.count === 0) throw new InsufficientBalanceError();

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const membership = await tx.userMembership.create({
        data: {
          userId,
          tierId: tier.id,
          startedAt: now,
          expiresAt,
          pricePaid: tier.price,
          durationDaysSnapshot: tier.durationDays,
          source: "purchase",
        },
      });
      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "MEMBERSHIP",
          amount: -tier.price,
          balanceAfter: wallet.balance,
          referenceType: "membership",
          referenceId: membership.id,
          idempotencyKey: `membership:${membership.id}`,
        },
      });
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      return { error: "Saldo tidak cukup. Isi saldo dulu di halaman Isi Saldo." };
    }
    throw e;
  }

  revalidatePath("/account");
  revalidatePath("/membership");
  return { ok: `Berhasil upgrade ke tier ${tier.name}! Aktif sampai ${expiresAt.toLocaleDateString("id-ID")}.` };
}
