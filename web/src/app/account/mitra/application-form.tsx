"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitPartnerApplication, type ApplicationResult } from "@/app/actions/partner-application";
import { BUSINESS_TYPES, MONTHLY_VOLUMES, PARTNER_PLATFORMS } from "@/lib/partner/application";

const INITIAL_STATE: ApplicationResult = {};
const SELECT_CLASS = "h-9 w-full rounded-md border bg-transparent px-3 text-sm";

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-heading text-sm font-bold">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export function PartnerApplicationForm({ defaultPicName }: { defaultPicName: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: ApplicationResult, formData: FormData) => submitPartnerApplication(formData),
    INITIAL_STATE,
  );

  // Setelah sukses, form dikunci total. Tanpa ini, tombol tetap bisa ditekan
  // lagi dan percobaan kedua akan ditolak "masih dalam antrean" — pesan yang
  // terlihat seperti kegagalan padahal pengajuannya justru sudah masuk.
  const locked = pending || Boolean(state.ok);

  return (
    <form action={formAction} className="flex flex-col gap-7">
      <Section title="Data usaha" hint="Identitas bisnis yang akan tercantum sebagai mitra.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Nama usaha *</Label>
            <Input id="businessName" name="businessName" required maxLength={120} disabled={locked} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="businessType">Bentuk badan usaha *</Label>
            <select id="businessType" name="businessType" className={SELECT_CLASS} disabled={locked} defaultValue="PERORANGAN">
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="businessCity">Kota/kabupaten *</Label>
            <Input id="businessCity" name="businessCity" required maxLength={80} disabled={locked} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="websiteUrl">Website / toko online</Label>
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              placeholder="https://tokoanda.com"
              maxLength={300}
              disabled={locked}
            />
            <p className="text-xs text-muted-foreground">Boleh dikosongkan kalau belum punya.</p>
          </div>
        </div>
      </Section>

      <Section title="Penanggung jawab" hint="Orang yang kami hubungi kalau ada masalah integrasi atau saldo.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="picName">Nama penanggung jawab *</Label>
            <Input id="picName" name="picName" required maxLength={120} defaultValue={defaultPicName} disabled={locked} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="picPhone">Nomor WhatsApp *</Label>
            <Input id="picPhone" name="picPhone" required placeholder="08xxxxxxxxxx" maxLength={24} disabled={locked} />
            <p className="text-xs text-muted-foreground">
              Wajib aktif — dipakai kalau transaksi kamu bermasalah di luar jam kerja.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="picRole">Jabatan</Label>
            <Input id="picRole" name="picRole" placeholder="Owner / Manajer Operasional" maxLength={80} disabled={locked} />
          </div>
        </div>
      </Section>

      <Section
        title="Data teknis"
        hint="Boleh dikosongkan kalau belum siap — semuanya masih bisa diatur sendiri di portal mitra setelah disetujui."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="platform">Sistem yang dipakai</Label>
            <select id="platform" name="platform" className={SELECT_CLASS} disabled={locked} defaultValue="">
              <option value="">— Pilih —</option>
              {PARTNER_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monthlyVolume">Estimasi volume transaksi *</Label>
            <select id="monthlyVolume" name="monthlyVolume" className={SELECT_CLASS} required disabled={locked} defaultValue="">
              <option value="" disabled>
                — Pilih —
              </option>
              {MONTHLY_VOLUMES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="serverIps">IP server kamu</Label>
            <Input
              id="serverIps"
              name="serverIps"
              placeholder="103.28.14.5, 103.28.14.6"
              maxLength={500}
              disabled={locked}
            />
            <p className="text-xs text-muted-foreground">
              Pisahkan dengan koma. Hanya IP ini yang boleh memanggil API kamu — kosongkan kalau IP servermu
              berganti-ganti (hosting cloud).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="callbackUrl">URL callback</Label>
            <Input
              id="callbackUrl"
              name="callbackUrl"
              type="url"
              placeholder="https://server-anda.com/callback"
              maxLength={500}
              disabled={locked}
            />
            <p className="text-xs text-muted-foreground">
              Alamat yang kami panggil saat transaksi selesai. Kosongkan kalau mau cek status sendiri.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Catatan" hint="Produk yang paling kamu butuhkan, atau hal lain yang perlu kami tahu.">
        <Textarea id="notes" name="notes" rows={3} maxLength={1000} disabled={locked} />
      </Section>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={locked} className="self-start">
          {pending ? "Mengirim..." : "Kirim Pengajuan"}
        </Button>
        {(state.ok || state.error) && (
          <p className={`text-xs ${state.error ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {state.error ?? state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
