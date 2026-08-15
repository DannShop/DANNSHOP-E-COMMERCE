import type { Prisma } from "@prisma/client";

// Menyusun potongan write voucher yang ditempelkan ke pembuatan order.

export interface AppliedVoucher {
  id: string;
  code: string;
  discount: bigint;
  targetKey: string;
}

/**
 * Bagian `voucherRedemption` untuk `db.order.create`.
 *
 * SENGAJA berupa nested create pada operasi pembuatan order yang sama, bukan
 * dua penulisan berurutan. Order dan catatan pemakaiannya harus lahir bersama
 * atau tidak sama sekali: order bervoucher yang catatannya gagal ditulis akan
 * memberi potongan harga yang tidak pernah terhitung ke kuota mana pun -
 * artinya voucher berkuota 100 bisa dipakai tanpa batas, dan tidak ada satu
 * pun error yang muncul saat itu terjadi.
 */
export function buildVoucherRedemption(
  voucher: AppliedVoucher | null,
  userId: string | null,
): Pick<Prisma.OrderUncheckedCreateInput, "discount" | "voucherCode" | "voucherRedemption"> {
  if (!voucher) return {};
  return {
    discount: voucher.discount,
    voucherCode: voucher.code,
    voucherRedemption: {
      create: {
        voucherId: voucher.id,
        targetKey: voucher.targetKey,
        userId,
        amount: voucher.discount,
      },
    },
  };
}

/** Harga yang benar-benar ditagihkan sebelum fee & kode unik. */
export function netPrice(price: bigint, voucher: AppliedVoucher | null): bigint {
  // checkVoucher() sudah menjepit potongan ke harga, jadi hasilnya tidak pernah
  // negatif. Dijepit sekali lagi di sini karena fungsi ini yang menentukan
  // nominal tagihan, dan angka negatif di jalur bayar-saldo berarti MENAMBAH
  // saldo pembeli - satu-satunya tempat yang pantas berhati-hati dua kali.
  const net = price - (voucher?.discount ?? 0n);
  return net < 0n ? 0n : net;
}
