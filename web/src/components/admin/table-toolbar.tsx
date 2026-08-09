"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_SIZE_OPTIONS, type PaginationInfo } from "@/lib/admin/pagination";

// Kontrol tabel admin: jumlah baris, navigasi halaman, dan filter tanggal.
//
// Semua state hidup di QUERY STRING, bukan di React state. Konsekuensinya
// disengaja: halaman yang sedang dilihat admin bisa di-bookmark, dibagikan ke
// orang lain, dan bertahan setelah refresh - dan Server Component-nya cukup
// membaca searchParams tanpa perlu jalur pengambilan data kedua di klien.

function useQueryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };
}

export function PageSizeSelect({ value }: { value: number }) {
  const navigate = useQueryNav();
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      Tampilkan
      <select
        value={value}
        // Halaman direset ke 1: pindah dari "20 per halaman, halaman 7" ke "200
        // per halaman" akan melompat jauh melewati akhir data kalau nomor
        // halamannya dipertahankan.
        onChange={(e) => navigate({ per: e.target.value, page: null })}
        className="h-8 rounded-md border bg-transparent px-2 text-sm"
        aria-label="Jumlah baris per halaman"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      baris
    </label>
  );
}

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const navigate = useQueryNav();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        type="date"
        defaultValue={from}
        onChange={(e) => navigate({ from: e.target.value || null, page: null })}
        className="h-8 w-36 text-sm"
        aria-label="Tanggal mulai"
      />
      <span className="text-xs text-muted-foreground">s/d</span>
      <Input
        type="date"
        defaultValue={to}
        onChange={(e) => navigate({ to: e.target.value || null, page: null })}
        className="h-8 w-36 text-sm"
        aria-label="Tanggal akhir"
      />
      {(from || to) && (
        <Button type="button" variant="ghost" size="xs" onClick={() => navigate({ from: null, to: null, page: null })}>
          Reset
        </Button>
      )}
    </div>
  );
}

export function Pagination({ info }: { info: PaginationInfo }) {
  const navigate = useQueryNav();
  if (info.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {info.from}–{info.to} dari {info.total.toLocaleString("id-ID")}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={info.page <= 1}
          onClick={() => navigate({ page: String(info.page - 1) })}
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Sebelumnya
        </Button>
        <span className="px-2 text-xs tabular-nums">
          {info.page} / {info.totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={info.page >= info.totalPages}
          onClick={() => navigate({ page: String(info.page + 1) })}
        >
          Berikutnya
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
