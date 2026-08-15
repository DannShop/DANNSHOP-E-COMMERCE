"use client";

import { useActionState, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionMessage } from "@/components/action-feedback";

type ActionResult = { ok?: string; error?: string };
const INITIAL_STATE: ActionResult = {};

export interface AutoMarginValues {
  autoMarginMode: string;
  autoMarginBp: number;
  autoMarginRound: number;
  autoMarginMaxJumpBp: number;
}

const MODE_LABEL: Record<string, string> = {
  OFF: "Mati",
  FOLLOW_DELTA: "Ikut selisih modal",
  FORMULA: "Rumus margin",
};

/**
 * Penyetel margin otomatis per kategori.
 *
 * Form TERPISAH dari nama/urutan kategori, dan itu disengaja: mengganti nama
 * kategori adalah perubahan kosmetik yang dilakukan sambil lalu, sedangkan
 * menyalakan aturan yang menggerakkan harga jual sendiri bukan. Satu tombol
 * Simpan untuk keduanya membuat yang kedua ikut tertekan tanpa dipikirkan.
 */
export function AutoMarginForm({
  category,
  action,
}: {
  category: { id: string; name: string } & AutoMarginValues;
  action: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: ActionResult, formData: FormData) => action(formData),
    INITIAL_STATE,
  );
  const [mode, setMode] = useState(category.autoMarginMode);
  const off = mode === "OFF";

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg border border-dashed p-3">
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="autoMarginMode" value={mode} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
          Margin otomatis
        </p>
        <Badge variant={off ? "muted" : "success"}>{MODE_LABEL[category.autoMarginMode] ?? category.autoMarginMode}</Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`mode-${category.id}`}>Saat harga modal provider berubah…</Label>
        <Select value={mode} onValueChange={(v) => v && setMode(v)}>
          <SelectTrigger id={`mode-${category.id}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OFF">Jangan ubah harga jual</SelectItem>
            <SelectItem value="FOLLOW_DELTA">Geser harga jual sebesar perubahan modal</SelectItem>
            <SelectItem value="FORMULA">Hitung ulang: modal + margin</SelectItem>
          </SelectContent>
        </Select>
        {mode === "FOLLOW_DELTA" && (
          <p className="text-xs text-muted-foreground">
            Modal naik Rp 111 → harga jual naik Rp 111. Item yang modalnya tidak berubah <strong>tidak disentuh</strong>,
            jadi harga yang sudah kamu setel manual tetap aman.
          </p>
        )}
        {mode === "FORMULA" && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Semua harga jual di kategori ini akan dihitung ulang dari margin di bawah — termasuk item yang modalnya
            tidak berubah. Harga yang pernah kamu setel manual akan tertimpa.
          </p>
        )}
      </div>

      {!off && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`margin-${category.id}`}>Margin (%)</Label>
            <Input
              id={`margin-${category.id}`}
              name="marginPercent"
              type="number"
              min={0}
              step="0.1"
              defaultValue={category.autoMarginBp / 100}
              disabled={mode !== "FORMULA"}
            />
            <p className="text-xs text-muted-foreground">
              {mode === "FORMULA" ? "Dipakai menghitung harga jual." : "Hanya dipakai mode rumus."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`round-${category.id}`}>Bulatkan ke atas</Label>
            <Input
              id={`round-${category.id}`}
              name="autoMarginRound"
              type="number"
              min={0}
              step={100}
              defaultValue={category.autoMarginRound}
            />
            <p className="text-xs text-muted-foreground">Kelipatan rupiah. 0 = tanpa pembulatan.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`jump-${category.id}`}>Batas lonjakan (%)</Label>
            <Input
              id={`jump-${category.id}`}
              name="maxJumpPercent"
              type="number"
              min={1}
              step={5}
              defaultValue={category.autoMarginMaxJumpBp / 100}
            />
            <p className="text-xs text-muted-foreground">
              Perubahan modal di atas ini ditahan, tidak diikuti — jaring kalau provider salah kirim data.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan margin otomatis"}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
