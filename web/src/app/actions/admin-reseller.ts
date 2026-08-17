import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAdminAction, requireAdminSession } from "@/lib/auth/admin-gate";

export type ActionResult = { ok?: string; error?: string };

// Mengelola peserta program reseller.
//
// Izin `users.manage`, sama dengan menangguhkan akun user: mencabut status
// reseller MENGHILANGKAN potongan harganya seketika, jadi bobotnya setara
// tindakan terhadap akun orang - bukan sekadar mengubah katalog.
const requireAdmin = () => requireAdminSession("users.manage");

/**
 * Menyalakan/mematikan status reseller seseorang.
 *
 * Mematikan TIDAK menghapus barisnya dan TIDAK mengembalikan uang paket. Yang
 * berubah cuma `isActive`, dan getMembershipContext() langsung berhenti memberi
 * potongan (lihat cabangnya di lib/membership/tier.ts). Menyalakannya lagi
 * mengembalikan paket yang sama persis, karena `tierId` & `tierPricePaid` tidak
 * pernah disentuh - orang yang sudah membayar tidak kehilangan apa yang dibelinya
 * hanya karena sempat dinonaktifkan.
 */
export async function setResellerActive(formData: FormData): Promise<ActionResult> {
  "use server";
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const resellerId = formData.get("resellerId");
  const active = formData.get("active") === "1";
  if (typeof resellerId !== "string" || !resellerId) return { error: "Reseller tidak ditemukan." };

  const reseller = await db.resellerAccount.findUnique({
    where: { id: resellerId },
    select: { id: true, isActive: true, user: { select: { email: true } } },
  });
  if (!reseller) return { error: "Reseller tidak ditemukan." };
  if (reseller.isActive === active) {
    return { error: active ? "Reseller ini sudah aktif." : "Reseller ini sudah nonaktif." };
  }

  await db.resellerAccount.update({ where: { id: resellerId }, data: { isActive: active } });
  await logAdminAction(
    admin.adminId,
    active ? "reseller.activate" : "reseller.deactivate",
    "reseller",
    resellerId,
    { email: reseller.user.email },
  );

  revalidatePath("/admin/reseller");
  return {
    ok: active
      ? `${reseller.user.email} diaktifkan kembali. Potongan harganya berlaku lagi.`
      : `${reseller.user.email} dinonaktifkan. Potongan harganya berhenti seketika.`,
  };
}
