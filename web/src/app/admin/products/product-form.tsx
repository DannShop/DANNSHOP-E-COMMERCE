"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionMessage, INITIAL_STATE, withPrevState } from "./action-utils";
import type { ServerAction } from "./action-utils";

export interface ProductFormCategory {
  id: string;
  name: string;
}

export interface ProductFormInitial {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  publisher: string | null;
  description: string | null;
  inputFields: unknown;
  nicknameCheckKey: string | null;
}

export function ProductForm({
  action,
  categories,
  initial,
  submitLabel,
}: {
  action: ServerAction;
  categories: ProductFormCategory[];
  initial?: ProductFormInitial;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(withPrevState(action), INITIAL_STATE);
  const inputFieldsDefault = initial ? JSON.stringify(initial.inputFields ?? [], null, 2) : "";

  return (
    <form action={formAction} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="categoryId">Kategori</Label>
          <Select
            name="categoryId"
            defaultValue={initial?.categoryId}
            items={categories.map((c) => ({ value: c.id, label: c.name }))}
            required
          >
            <SelectTrigger id="categoryId" className="w-full">
              <SelectValue placeholder="Pilih kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            required
            defaultValue={initial?.slug}
            placeholder="mobile-legends"
            pattern="[a-z0-9\-]+"
            title="Huruf kecil, angka, tanda hubung"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Nama produk</Label>
          <Input id="name" name="name" required defaultValue={initial?.name} placeholder="Mobile Legends" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="publisher">Publisher (opsional)</Label>
          <Input id="publisher" name="publisher" defaultValue={initial?.publisher ?? ""} placeholder="Moonton" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Deskripsi (opsional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={initial?.description ?? ""}
          placeholder="Deskripsi singkat produk untuk halaman member."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inputFields">Input fields (JSON array)</Label>
        <Textarea
          id="inputFields"
          name="inputFields"
          required
          defaultValue={inputFieldsDefault}
          className="font-mono text-xs"
          rows={4}
          placeholder={'[{"name":"user_id","label":"User ID"},{"name":"zone_id","label":"Zone ID"}]'}
        />
        <p className="text-xs text-muted-foreground">
          Daftar field yang diminta ke pembeli, contoh: {'[{"name":"user_id","label":"User ID"}]'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nicknameCheckKey">Nickname check key (opsional)</Label>
        <Input
          id="nicknameCheckKey"
          name="nicknameCheckKey"
          defaultValue={initial?.nicknameCheckKey ?? ""}
          placeholder="Kunci field untuk cek nickname otomatis, jika didukung provider"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : submitLabel}
        </Button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
