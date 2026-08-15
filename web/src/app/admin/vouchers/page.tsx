import { db } from "@/lib/db";
import { countVoucherUsageTotals } from "@/lib/voucher/usage";
import { saveVoucher, deleteVoucher, toggleVoucherActive } from "@/app/actions/vouchers";
import { VoucherList, type VoucherRow } from "./voucher-list";

/**
 * Format yang diterima `<input type="datetime-local">`: "YYYY-MM-DDTHH:mm".
 *
 * SENGAJA tidak memakai toISOString(): itu mengubah waktu ke UTC, sehingga jam
 * yang admin ketik tampil bergeser 7 jam saat form dibuka lagi - dan pergeseran
 * itu MENUMPUK setiap kali disimpan ulang. Yang dipakai di sini komponen waktu
 * lokal server, sama dengan yang dibaca `new Date(value)` di server action.
 */
function toLocalInput(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function VouchersPage() {
  const [vouchers, categories, products] = await Promise.all([
    db.voucher.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { categories: { select: { id: true } }, products: { select: { id: true } } },
    }),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Pemakaian dihitung dari status order, bukan dari kolom penghitung - lihat
  // alasan lengkapnya di lib/voucher/usage.ts. Diambil sekali untuk seluruh
  // daftar (groupBy), bukan satu query per baris.
  const usage = await countVoucherUsageTotals(vouchers.map((v) => v.id));
  const now = new Date();

  const rows: VoucherRow[] = vouchers.map((v) => ({
    id: v.id,
    code: v.code,
    description: v.description ?? "",
    discountType: v.discountType,
    percentBp: v.percentBp,
    // BigInt tidak bisa melintasi batas Server Component -> Client Component.
    amount: v.amount.toString(),
    minSpend: v.minSpend.toString(),
    quota: v.quota,
    perTargetLimit: v.perTargetLimit,
    startAt: toLocalInput(v.startAt),
    endAt: toLocalInput(v.endAt),
    isActive: v.isActive,
    allowFlashSale: v.allowFlashSale,
    allowGuest: v.allowGuest,
    categoryIds: v.categories.map((c) => c.id),
    productIds: v.products.map((p) => p.id),
    usedCount: usage.get(v.id) ?? 0,
    expired: v.endAt !== null && v.endAt < now,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <VoucherList
        vouchers={rows}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
        products={products.map((p) => ({ id: p.id, label: p.name }))}
        saveAction={saveVoucher}
        deleteAction={deleteVoucher}
        toggleAction={toggleVoucherActive}
      />

      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-semibold text-foreground">Yang perlu diketahui</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            Batas pemakaian dihitung per <strong>nomor tujuan</strong> (nomor HP / User ID + Zone ID),
            bukan per email — email baru gratis dibuat, akun game tidak.
          </li>
          <li>
            Pesanan yang belum dibayar <strong>tetap memegang kuota</strong> sampai kedaluwarsa. Kuotanya
            kembali sendiri begitu pesanan gagal, kedaluwarsa, atau direfund.
          </li>
          <li>
            Potongan dihitung dari harga <strong>setelah</strong> flash sale &amp; diskon tier member, lalu
            dijepit ke harga item — tagihan tidak pernah jadi minus.
          </li>
        </ul>
      </div>
    </div>
  );
}
