"use client";

import { ChevronDown, PackagePlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroupLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CatalogSource } from "@/lib/providers/labels";

/**
 * Satu pintu masuk untuk SEMUA cara menambah produk.
 *
 * Sebelumnya header ini berisi dua tombol sejajar, dan salah satunya berlabel
 * "Tambah dari Digiflazz" — padahal halaman yang dituju sejak awal bisa menarik
 * dari provider mana pun (pemilih provider ada DI DALAM halaman itu). Labelnya
 * yang menyembunyikan kemampuan tersebut, bukan kodenya. Menambah tombol kedua
 * per provider akan memperbanyak masalahnya: tiap provider baru berarti satu
 * tombol lagi di baris yang sama.
 *
 * Daftar providernya datang dari database (lihat getCatalogSources), jadi
 * provider berikutnya muncul di sini tanpa file ini perlu disentuh lagi.
 */
export function AddProductMenu({ sources }: { sources: CatalogSource[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Tambah produk
            <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent>
        <DropdownMenuLinkItem href="/admin/products/new">
          <PackagePlus className="mt-0.5" aria-hidden="true" />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Produk manual</span>
            <span className="text-xs text-muted-foreground">
              Isi sendiri nama, harga, dan itemnya. Untuk barang yang dikirim admin.
            </span>
          </span>
        </DropdownMenuLinkItem>

        {sources.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroupLabel>Tarik dari provider</DropdownMenuGroupLabel>
            {sources.map((s) => (
              <DropdownMenuLinkItem key={s.key} href={`/admin/products/import?provider=${s.key}`}>
                <span className="flex flex-1 items-center justify-between gap-2">
                  <span className="font-medium">{s.label}</span>
                  {/* Provider nonaktif tetap boleh dipakai menyusun katalog —
                      lihat alasannya di getCatalogSources. Tandanya dipasang
                      supaya admin tidak heran kalau produknya sudah jadi tapi
                      belum bisa dipesan. */}
                  {!s.isActive && <Badge variant="muted">Belum aktif</Badge>}
                </span>
              </DropdownMenuLinkItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
