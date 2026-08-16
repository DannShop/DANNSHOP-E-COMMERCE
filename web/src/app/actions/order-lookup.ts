"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { cancelPendingOrder } from "@/lib/order/cancel";
import { maskOrderTarget } from "@/lib/order/customer-no";

export interface OrderLookupRow {
  orderNumber: string;
  publicToken: string;
  productName: string;
  itemName: string;
  status: string;
  total: string; // bigint diserialisasi - Server Action tidak boleh mengembalikan BigInt
  createdAtDisplay: string; // sudah diformat di server, hindari mismatch locale saat hidrasi
  maskedTarget: string;
}

export interface OrderLookupResult {
  error?: string;
  /** Terisi kalau pencarian memakai nomor pesanan - langsung ke invoicenya. */
  publicToken?: string;
  /** Terisi kalau pencarian memakai email saja. */
  orders?: OrderLookupRow[];
}

export type CancelResult = { ok?: string; error?: string };

// Nomor pesanan jadi OPSIONAL. Pembeli jarang menyimpan nomor invoice, dan
// memaksanya membuat halaman ini praktis tidak terpakai - persis keluhan yang
// memunculkan perubahan ini. Kalau diisi, dia tetap jadi jalan pintas langsung
// ke satu invoice.
const lookupSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email tidak valid")),
  orderNumber: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim()),
});

/** Berapa pesanan terakhir yang ditampilkan saat mencari dengan email saja. */
const MAX_ROWS = 20;

export async function lookupOrder(
  _prev: OrderLookupResult | undefined,
  formData: FormData,
): Promise<OrderLookupResult> {
  const ip = extractIp(await headers());
  const limit = await checkRateLimit(`order-lookup:ip:${ip}`, 5, 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." };

  const parsed = lookupSchema.safeParse({
    email: formData.get("email"),
    orderNumber: formData.get("orderNumber") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // MySQL default collation (utf8mb4_unicode_ci) di tabel ini sudah
  // case-insensitive - tidak perlu (dan tidak didukung Prisma) mode "insensitive"
  // yang cuma berlaku untuk provider Postgres/MongoDB.
  if (parsed.data.orderNumber) {
    const order = await db.order.findFirst({
      where: { orderNumber: parsed.data.orderNumber, buyerEmail: parsed.data.email },
      select: { publicToken: true },
    });
    // Pesan generik disengaja - tidak membedakan "nomor pesanan tidak ada" vs
    // "email tidak cocok", supaya tidak jadi celah enumerasi.
    if (!order) return { error: "Pesanan tidak ditemukan. Cek kembali email dan nomor pesanannya." };
    return { publicToken: order.publicToken };
  }

  const orders = await db.order.findMany({
    where: { buyerEmail: parsed.data.email },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      orderNumber: true,
      publicToken: true,
      productName: true,
      itemName: true,
      status: true,
      total: true,
      createdAt: true,
      target: true,
    },
  });
  if (orders.length === 0) {
    return { error: "Tidak ada pesanan untuk email tersebut. Cek kembali alamat emailnya." };
  }

  return {
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      publicToken: o.publicToken,
      productName: o.productName,
      itemName: o.itemName,
      status: o.status,
      total: o.total.toString(),
      createdAtDisplay: o.createdAt.toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      }),
      maskedTarget: maskOrderTarget(o.target),
    })),
  };
}

/**
 * Pembeli membatalkan pesanannya sendiri dari halaman invoice.
 *
 * Kredensialnya adalah publicToken, BUKAN sesi - halaman invoice memang dijaga
 * token (pembeli tamu tidak punya akun sama sekali), dan token itu sudah
 * diperlakukan sebagai kredensial di seluruh alur ini: halamannya menampilkan
 * email pembeli, nomor tujuan, dan nominal. Lihat komentar Order.publicToken.
 *
 * Yang bisa dibatalkan hanya pesanan yang belum dibayar - gerbangnya ada di
 * cancelPendingOrder(), satu tempat yang sama dengan tombol admin.
 */
export async function cancelOrderByToken(
  _prev: CancelResult | undefined,
  formData: FormData,
): Promise<CancelResult> {
  const ip = extractIp(await headers());
  const limit = await checkRateLimit(`order-cancel:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." };

  const token = formData.get("publicToken");
  if (typeof token !== "string" || !token) return { error: "Pesanan tidak ditemukan." };

  const order = await db.order.findUnique({ where: { publicToken: token }, select: { id: true } });
  if (!order) return { error: "Pesanan tidak ditemukan." };

  const result = await cancelPendingOrder(order.id, "Dibatalkan pembeli dari halaman invoice");
  if (result.ok) revalidatePath(`/invoice/${token}`);
  return result;
}
