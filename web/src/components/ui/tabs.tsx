"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex items-center gap-1 rounded-lg bg-muted p-1", className)}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-selected:bg-background data-selected:text-foreground data-selected:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

/**
 * Panel tab.
 *
 * `keepMounted` DIPAKSA true dan tidak bisa dimatikan pemanggil. Alasannya bukan
 * performa: panel-panel di halaman edit produk berbagi SATU `<form>` (harga dan
 * flash sale disimpan oleh action yang sama). Kalau panel yang tidak aktif
 * dilepas dari DOM, input di dalamnya ikut hilang dari FormData — jadi menyimpan
 * dari tab "Harga" akan mengirim harga flash KOSONG dan menghapus flash sale yang
 * sudah tersimpan, tanpa satu pun pesan. Kegagalan senyap yang menyentuh harga.
 */
function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      keepMounted
      // Base UI menandai panel tak aktif dengan atribut `hidden` bawaan HTML.
      // Ditegaskan lewat CSS supaya tetap tersembunyi kalau kelas lain sempat
      // memberi panel ini `display` (yang akan mengalahkan `hidden`).
      className={cn("outline-none [&[hidden]]:hidden", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsPanel, TabsTab }
