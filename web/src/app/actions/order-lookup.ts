"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";

export interface OrderLookupResult {
  error?: string;
  publicToken?: string;
}

const lookupSchema = z.object({
  email: z.string().email("Email tidak valid"),
  orderNumber: z.string().min(1, "Nomor pesanan wajib diisi"),
});

export async function lookupOrder(_prev: OrderLookupResult | undefined, formData: FormData): Promise<OrderLookupResult> {
  const ip = extractIp(await headers());
  const limit = await checkRateLimit(`order-lookup:ip:${ip}`, 5, 60_000);
  if (!limit.allowed) return { error: "Terlalu banyak percobaan, coba lagi sebentar lagi." };

  const parsed = lookupSchema.safeParse({
    email: formData.get("email"),
    orderNumber: formData.get("orderNumber"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // MySQL default collation (utf8mb4_unicode_ci) di tabel ini sudah
  // case-insensitive - tidak perlu (dan tidak didukung Prisma) mode "insensitive"
  // yang cuma berlaku untuk provider Postgres/MongoDB.
  const order = await db.order.findFirst({
    where: {
      orderNumber: parsed.data.orderNumber.trim(),
      buyerEmail: parsed.data.email.trim(),
    },
    select: { publicToken: true },
  });
  // Pesan generik disengaja - tidak membedakan "nomor pesanan tidak ada" vs
  // "email tidak cocok", supaya tidak jadi celah enumerasi (mirip pola
  // registerAction Fase 7d, M-5).
  if (!order) return { error: "Pesanan tidak ditemukan. Cek kembali email dan nomor pesanan Anda." };

  return { publicToken: order.publicToken };
}
