"use client";

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Primitif form khusus halaman auth.
 *
 * ui/input dan ui/button bawaan dirancang untuk kerapatan panel admin (h-8) -
 * terlalu kecil untuk halaman yang isinya cuma 2-3 field dan sering dibuka dari
 * HP. Di sini semuanya dinaikkan ke 44px, angka minimum target sentuh yang
 * dipakai Apple di HIG. Tingginya sengaja dikunci lewat satu konstanta supaya
 * input dan tombol submit tidak pernah beda tinggi.
 */
const CONTROL_HEIGHT = "h-11";
const FIELD_CLASS = `${CONTROL_HEIGHT} rounded-xl px-3.5 text-base md:text-base`;

type FieldProps = Omit<ComponentProps<"input">, "className"> & {
  label: string;
  /** Keterangan kecil di bawah field, mis. aturan panjang password. */
  hint?: string;
};

export function AuthField({ label, hint, id, ...props }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-[0.8125rem] text-muted-foreground">
        {label}
      </Label>
      <Input id={fieldId} className={FIELD_CLASS} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  id,
  action,
  ...props
}: FieldProps & {
  /** Slot di kanan label, mis. tautan "Lupa password?". */
  action?: ReactNode;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={fieldId} className="text-[0.8125rem] text-muted-foreground">
          {label}
        </Label>
        {action}
      </div>

      <div className="relative">
        {/* pr-11 menyisakan ruang persis selebar tombol mata di kanan supaya
            teks password tidak pernah berjalan di bawahnya. */}
        <Input
          id={fieldId}
          type={visible ? "text" : "password"}
          className={cn(FIELD_CLASS, "pr-11")}
          {...props}
        />
        <button
          type="button"
          // tabIndex -1: urutan Tab harus langsung dari password ke tombol
          // submit. Tombol ini tetap bisa diklik & tetap punya aria-label.
          tabIndex={-1}
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AuthAlert({
  variant,
  children,
}: {
  variant: "error" | "success";
  children: ReactNode;
}) {
  const isError = variant === "error";
  return (
    <p
      // role="alert" memaksa screen reader membacakan langsung (kegagalan login
      // perlu segera diketahui); role="status" mengantre dengan sopan.
      role={isError ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-sm",
        isError
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      )}
    >
      {children}
    </p>
  );
}

export function AuthSubmit({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cn(CONTROL_HEIGHT, "mt-1 w-full rounded-xl text-[0.9375rem]")}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
