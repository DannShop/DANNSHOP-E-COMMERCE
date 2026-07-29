"use client"

import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"

import { cn } from "@/lib/utils"

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({ className, children, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[var(--radius)] border-2 border-border bg-background p-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary/10 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-input">
        <RadioPrimitive.Indicator
          data-slot="radio-group-item-indicator"
          className="size-2.5 rounded-full bg-primary"
        />
      </span>
      {children}
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
