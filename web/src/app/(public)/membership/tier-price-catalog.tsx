"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Search, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import type { TierCatalogProduct, TierCatalogCategory } from "@/lib/catalog/public";
import type { TierPriceTableResult } from "@/lib/membership/tier-price-table";

type TableState =
  | { status: "ready"; data: TierPriceTableResult }
  | { status: "loading" }
  | { status: "error"; message: string };

export function TierPriceCatalog({
  products,
  categories,
  initialProductId,
  initialTable,
  loadTable,
}: {
  products: TierCatalogProduct[];
  categories: TierCatalogCategory[];
  initialProductId: string;
  /** Tabel produk pertama sudah dirender server - lihat catatan di page.tsx. */
  initialTable: TierPriceTableResult;
  loadTable: (formData: FormData) => Promise<TierPriceTableResult & { error?: string }>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialProductId);
  const [table, setTable] = useState<TableState>({ status: "ready", data: initialTable });

  // Tiap permintaan dinomori supaya balasan yang datang terlambat dari produk
  // yang SUDAH tidak dipilih lagi tidak menimpa tabel produk terbaru - klik
  // cepat antar game gampang memicu itu kalau jaringannya lambat.
  const requestSeq = useRef(0);

  // Pengambilan data sengaja hidup di event handler, BUKAN useEffect: tabel
  // pertama sudah datang dari server lewat initialTable, jadi satu-satunya
  // pemicu muat ulang adalah aksi user. Ini juga yang membuat komponen ini
  // bebas dari cascading render yang diperingatkan react-hooks.
  async function selectProduct(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    const seq = ++requestSeq.current;
    setTable({ status: "loading" });
    try {
      const fd = new FormData();
      fd.set("productId", id);
      const res = await loadTable(fd);
      if (seq !== requestSeq.current) return;
      if (res.error) setTable({ status: "error", message: res.error });
      else setTable({ status: "ready", data: { tiers: res.tiers, rows: res.rows } });
    } catch {
      if (seq !== requestSeq.current) return;
      setTable({ status: "error", message: "Gagal memuat harga. Coba pilih ulang produknya." });
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!categoryId || p.categoryId === categoryId) &&
        (!q || p.name.toLowerCase().includes(q) || (p.publisher ?? "").toLowerCase().includes(q)),
    );
  }, [products, categoryId, query]);

  // Ganti kategori memindahkan pilihan ke produk pertama kategori itu, tapi
  // HANYA kalau produk yang sedang dilihat memang bukan anggotanya - kalau
  // masih, tabelnya dibiarkan supaya customer tidak kehilangan yang sedang
  // dibandingkan cuma karena menyentuh filter.
  function selectCategory(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    const stillVisible = products.some(
      (p) => p.id === selectedId && (!nextCategoryId || p.categoryId === nextCategoryId),
    );
    if (stillVisible) return;
    const firstOfCategory = products.find((p) => !nextCategoryId || p.categoryId === nextCategoryId);
    if (firstOfCategory) void selectProduct(firstOfCategory.id);
  }

  // Pencarian sengaja TIDAK memindahkan pilihan - mengetik untuk mencari game
  // lain tidak seharusnya menghapus tabel yang sedang dibaca sebelum
  // pilihannya benar-benar diklik.
  const selected = products.find((p) => p.id === selectedId) ?? null;
  const countFor = (id: string) => products.filter((p) => !id || p.categoryId === id).length;

  return (
    <section className="flex flex-col gap-5">
      <div className="text-center">
        <p className="font-heading text-xs font-bold tracking-[0.18em] text-primary uppercase">
          Harga Khusus Member
        </p>
        <h2 className="mt-1.5 font-heading text-xl font-bold sm:text-2xl">Lihat Hematmu Sebelum Langganan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pilih game atau layanan, lalu bandingkan harga tiap nominal di semua tier.
        </p>
      </div>

      {/* ===== Filter kategori =====
          Dropdown, bukan deretan chip: katalog ini punya 10 kategori dan
          jumlahnya ditentukan admin lewat panel, jadi kontrolnya harus punya
          tinggi tetap berapa pun kategorinya bertambah. <select> native
          dipilih daripada dropdown kustom karena di ponsel dia memunculkan
          picker bawaan OS yang jauh lebih enak dipakai satu tangan - pola
          yang sama sudah dipakai di markup-form.tsx panel admin. */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="tier-catalog-category" className="text-sm font-medium">
          Kategori
        </label>
        <select
          id="tier-catalog-category"
          value={categoryId}
          onChange={(e) => selectCategory(e.target.value)}
          className="h-9 min-w-[12rem] flex-1 rounded-md border bg-background px-2 text-sm sm:flex-none"
        >
          <option value="">Semua ({countFor("")})</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({countFor(c.id)})
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border">
        {/* ===== Pencarian ===== */}
        <div className="relative border-b">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk"
            aria-label="Cari produk"
            className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          />
        </div>

        {/* ===== Picker produk ===== */}
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Tidak ada produk yang cocok dengan pencarianmu.
          </p>
        ) : (
          <div role="tablist" aria-label="Pilih produk" className="no-scrollbar flex gap-3 overflow-x-auto p-3">
            {filtered.map((p) => {
              const isActive = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => void selectProduct(p.id)}
                  className={cn(
                    "w-24 shrink-0 rounded-lg p-1.5 text-left transition-colors duration-200 ease-out",
                    isActive ? "bg-primary/10" : "hover:bg-foreground/[0.04]",
                  )}
                >
                  <div
                    className={cn(
                      "relative aspect-square w-full overflow-hidden rounded-md bg-gradient-to-br from-primary to-accent ring-2 transition-[box-shadow] duration-200",
                      isActive ? "ring-primary" : "ring-transparent",
                    )}
                  >
                    {p.iconUrl && (
                      <Image src={p.iconUrl} alt="" fill sizes="96px" className="object-cover" unoptimized />
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-1.5 line-clamp-2 block text-xs leading-tight font-medium",
                      isActive ? "text-primary" : "text-foreground",
                    )}
                  >
                    {p.name}
                  </span>
                  {p.publisher && (
                    <span className="line-clamp-1 block text-[10px] text-muted-foreground">{p.publisher}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Tabel harga ===== */}
      {selected && (
        <div className="flex flex-col gap-2">
          <h3 className="font-heading text-sm font-bold">Katalog Harga — {selected.name}</h3>
          <PriceTable state={table} />
        </div>
      )}
    </section>
  );
}

function PriceTable({ state }: { state: TableState }) {
  if (state.status === "loading") {
    return (
      <div className="rounded-[var(--radius)] border p-8 text-center text-sm text-muted-foreground">
        Memuat harga...
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-[var(--radius)] border p-8 text-center text-sm text-muted-foreground">
        {state.message}
      </div>
    );
  }

  const { tiers, rows } = state.data;
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border p-8 text-center text-sm text-muted-foreground">
        Produk ini belum punya nominal yang tayang.
      </div>
    );
  }
  const anyFlash = rows.some((r) => r.flashActive);

  return (
    <>
      {/* Tabel HTML biasa, bukan komponen Table milik panel admin: yang itu
          dirancang untuk daftar padat di layar lebar, sementara di sini jumlah
          kolomnya tumbuh mengikuti jumlah tier dan harus tetap terbaca di
          ponsel - jadi dibungkus scroller-nya sendiri.

          Tinggi dikunci max-h-96 dengan scroll di DALAM kotak: satu produk bisa
          punya 40 nominal, dan tanpa batas ini seksi katalog akan mendorong
          seluruh isi halaman di bawahnya ribuan piksel ke bawah. Dengan
          dikunci, tinggi seksi ini konstan berapa pun nominal produknya.
          Header dibuat sticky supaya nama tier tetap terbaca sambil menggulir
          - tanpa itu, menggulir ke nominal ke-30 berarti menebak kolom mana
          milik tier mana. */}
      <div className="max-h-96 overflow-auto rounded-[var(--radius)] border">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            {/* Warna latar dipasang di <th>, bukan di <tr>: baris sticky yang
                latarnya transparan akan ditembus konten yang lewat di baliknya. */}
            <tr>
              <th
                scope="col"
                className="bg-muted px-3 py-2.5 text-left font-heading text-xs font-bold tracking-wide uppercase"
              >
                Nominal
              </th>
              <th
                scope="col"
                className="bg-muted px-3 py-2.5 text-right font-heading text-xs font-bold tracking-wide uppercase"
              >
                Harga Normal
              </th>
              {tiers.map((t) => (
                <th key={t.id} scope="col" className="bg-muted px-3 py-2.5 text-right">
                  <span className="flex flex-col items-end gap-0.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: t.badgeColor }}
                    >
                      {t.name}
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      −{(t.discountPercent / 100).toFixed(t.discountPercent % 100 === 0 ? 0 : 2)}%
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.itemId} className="border-t">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5">
                    {row.itemName}
                    {row.flashActive && (
                      <Zap className="size-3.5 shrink-0 text-amber-500" aria-label="Flash sale sedang aktif" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatRupiah(BigInt(row.basePrice))}</td>
                {row.tierPrices.map((price, i) => {
                  const cheaper = BigInt(price) < BigInt(row.basePrice);
                  return (
                    <td
                      key={tiers[i]?.id ?? i}
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        cheaper && "font-semibold text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {formatRupiah(BigInt(price))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          {rows.length} nominal tersedia — gulir di dalam tabel untuk melihat sisanya. Harga di sini sama
          persis dengan yang ditagih saat checkout, dihitung lewat jalur harga yang sama, bukan perkiraan.
        </p>
        {anyFlash && (
          <p className="flex items-start gap-1.5">
            <Zap className="mt-0.5 size-3 shrink-0 text-amber-500" aria-hidden="true" />
            <span>
              Nominal bertanda petir sedang flash sale. Selama flash berjalan harganya sudah paling murah
              dan berlaku untuk semua orang, jadi kolom tiap tier menunjukkan angka yang sama.
            </span>
          </p>
        )}
      </div>
    </>
  );
}
