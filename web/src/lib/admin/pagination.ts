// Aturan pagination bersama untuk seluruh tabel panel admin.
//
// Dipusatkan supaya tiap halaman tidak memilih batas sendiri-sendiri: sebelum
// ini ada yang `take: 50` hardcode, ada yang `take: 100`, dan halaman produk
// tidak punya batas sama sekali (menarik SELURUH tabel produk tiap kali
// dibuka). Yang terakhir itu bukan sekadar lambat - dia tumbuh diam-diam
// sampai suatu hari melewati batas memori/waktu dan halamannya mati total.

export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Batas atas keras, bukan sekadar pilihan terbesar di dropdown: nilainya datang
 * dari query string yang bisa diketik siapa saja. Tanpa penjepit ini,
 * `?per=100000` adalah satu permintaan yang bisa menjatuhkan panel.
 */
export const MAX_PAGE_SIZE = 200;

export function parsePageSize(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return n;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  skip: number;
  from: number;
  to: number;
}

export function buildPagination(total: number, page: number, pageSize: number): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Halaman di luar jangkauan dijepit ke halaman terakhir, bukan menghasilkan
  // tabel kosong: itu yang terjadi tiap kali admin di halaman 5 lalu menyempitkan
  // filternya, dan tabel kosong terlihat seperti "datanya hilang".
  const safePage = Math.min(page, totalPages);
  const skip = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    skip,
    from: total === 0 ? 0 : skip + 1,
    to: Math.min(skip + pageSize, total),
  };
}

/** Rentang tanggal opsional dari query string, dinormalkan ke batas hari penuh. */
export function parseDateRange(
  rawFrom: string | undefined,
  rawTo: string | undefined,
): { from: Date | undefined; to: Date | undefined } {
  const from = rawFrom ? new Date(`${rawFrom}T00:00:00`) : undefined;
  const to = rawTo ? new Date(`${rawTo}T23:59:59.999`) : undefined;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  };
}

/** Klausa `createdAt` untuk Prisma, atau objek kosong kalau tidak ada filter. */
export function createdAtFilter(range: { from?: Date; to?: Date }): { createdAt?: { gte?: Date; lte?: Date } } {
  if (!range.from && !range.to) return {};
  return { createdAt: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } };
}
