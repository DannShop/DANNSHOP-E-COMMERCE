import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { retryOrderFulfillment, retryOrderRefund } from "@/lib/order/fulfillment";

export interface ActionResult {
  ok?: string;
  error?: string;
}

// Duplikasi requireAdmin/logAdmin dari catalog.ts/providers.ts sengaja
// dipertahankan (bukan diimpor) - file "use server" di Next.js 16 hanya
// boleh mengekspor async function, jadi helper non-async tidak bisa dipakai
// lintas file "use server". Pola sama persis di catalog.ts:21-27, providers.ts:27-33.
async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "order", targetId, detail },
  });
}

export async function retryFulfillmentAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }

  const result = await retryOrderFulfillment(orderId);
  if (!result.ok) return { error: result.error };

  await logAdmin(admin.adminId, "order.retry_fulfillment", orderId);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Percobaan fulfillment ulang dikirim." };
}

export async function retryRefundAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }

  const result = await retryOrderRefund(orderId);
  if (!result.ok) return { error: result.error };

  await logAdmin(admin.adminId, "order.retry_refund", orderId);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Refund ke saldo berhasil diulang." };
}

export async function markCompletedManualAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  const sn = formData.get("sn");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }
  if (typeof sn !== "string" || sn.trim().length === 0) {
    return { error: "SN/kode voucher wajib diisi." };
  }

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || (order.status !== "NEEDS_REVIEW" && order.status !== "PROCESSING")) {
    return { error: "Order tidak dalam status yang bisa ditandai selesai manual." };
  }

  await db.order.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: new Date() } });
  await db.orderStatusHistory.create({
    data: { orderId, toStatus: "COMPLETED", note: `Ditandai selesai manual oleh admin. SN: ${sn.trim()}` },
  });
  await logAdmin(admin.adminId, "order.mark_completed_manual", orderId, { sn: sn.trim() });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Order ditandai selesai." };
}

export async function markRefundedAction(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const orderId = formData.get("orderId");
  const orderNumber = formData.get("orderNumber");
  const note = formData.get("note");
  if (typeof orderId !== "string" || !orderId || typeof orderNumber !== "string" || !orderNumber) {
    return { error: "Order tidak ditemukan." };
  }
  if (typeof note !== "string" || note.trim().length === 0) {
    return { error: "Catatan (nomor referensi transfer) wajib diisi." };
  }

  const claimed = await db.order.updateMany({
    where: { id: orderId, status: "REFUND_PENDING" },
    data: { status: "REFUNDED" },
  });
  if (claimed.count === 0) return { error: "Order tidak dalam status Refund Pending." };

  await db.orderStatusHistory.create({
    data: { orderId, toStatus: "REFUNDED", note: `Direfund manual oleh admin: ${note.trim()}` },
  });
  await logAdmin(admin.adminId, "order.mark_refunded", orderId, { note: note.trim() });
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  return { ok: "Order ditandai sudah direfund." };
}
