"use client"

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Scroll di atas kolom angka JANGAN mengubah angkanya.
 *
 * Perilaku bawaan browser: begitu `<input type="number">` sedang fokus, roda
 * mouse/touchpad di atasnya diambil alih untuk menaikkan-menurunkan nilai. Orang
 * yang cuma bermaksud menggulir halaman ikut mengubah harga, urutan, atau fee
 * tanpa sadar — dan karena angkanya berubah sedikit demi sedikit, perubahannya
 * sering baru ketahuan setelah tersimpan.
 *
 * Yang dilakukan: melepas fokus, BUKAN `preventDefault()`. Keduanya sama-sama
 * menghentikan angkanya berubah, tapi `preventDefault` ikut membekukan gulir
 * halaman — obat yang lebih menjengkelkan daripada penyakitnya. Dengan melepas
 * fokus, angkanya diam dan halaman tetap bergulir seperti yang orangnya maksud.
 *
 * Ditaruh di komponen Input, bukan di tiap pemakaian: ada 20+ kolom angka di
 * aplikasi ini (harga, markup, urutan, fee, ambang saldo, durasi tier) dan yang
 * dibuat besok ikut terlindungi tanpa perlu ingat apa-apa.
 */
function Input({ className, type, onWheel, ...props }: React.ComponentProps<"input">) {
  function handleWheel(event: React.WheelEvent<HTMLInputElement>) {
    onWheel?.(event)
    if (type === "number" && document.activeElement === event.currentTarget) {
      event.currentTarget.blur()
    }
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      onWheel={handleWheel}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
