import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Status pill — dipakai untuk badge aktif/nonaktif & health status di admin.
// Setiap varian tetap membawa teks (bukan hanya warna) supaya makna tidak
// bergantung pada warna saja (a11y: color-not-only).
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        warning:
          "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
        destructive:
          "border-transparent bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
