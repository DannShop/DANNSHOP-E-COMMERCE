import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { getBaseUrl } from "@/lib/base-url";
import { extractIp } from "@/lib/rate-limit";
import { getPartnerSession } from "@/lib/partner/session";
import { CredentialsPanel, MitraConfigForm } from "./credentials-client";

export const metadata: Metadata = { title: "Kredensial Mitra" };
export const dynamic = "force-dynamic";

export default async function MitraCredentialsPage() {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const [base, requestHeaders] = await Promise.all([getBaseUrl(), headers()]);
  // IP BROWSER, bukan IP server mitra. Perbedaan ini ditekankan di UI karena
  // menyamakan keduanya adalah kesalahan yang mengunci integrasi mereka.
  const browserIp = extractIp(requestHeaders);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <section className="glass-card flex flex-col gap-4 rounded-2xl p-6">
        <div>
          <h2 className="font-heading text-base font-bold">Kredensial API</h2>
          <p className="text-sm text-muted-foreground">
            Dipakai untuk menghitung signature setiap request. Simpan di environment variable atau file konfigurasi di
            luar <code className="rounded bg-foreground/10 px-1 text-xs">public_html</code> — jangan di dalam repositori
            kode.
          </p>
        </div>
        <CredentialsPanel username={partner.username} hasCallbackSecret={partner.hasCallbackSecret} />
        <p className="rounded-lg border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Username tidak bisa diubah.</strong> Nilainya ikut masuk ke dalam rumus{" "}
          <code className="rounded bg-foreground/10 px-1">md5(username + apiKey + ref_id)</code>, jadi menggantinya
          berarti seluruh signature yang sudah kamu pasang jadi salah sekaligus.
        </p>
      </section>

      <section className="glass-card flex flex-col gap-4 rounded-2xl p-6">
        <div>
          <h2 className="font-heading text-base font-bold">Konfigurasi Integrasi</h2>
          <p className="text-sm text-muted-foreground">
            Kamu bisa mengubah keduanya sendiri kapan saja — tidak perlu menghubungi admin.
          </p>
        </div>
        <MitraConfigForm callbackUrl={partner.callbackUrl} ipWhitelist={partner.ipWhitelist} />
      </section>

      {/* Bagian ini ada karena satu alasan konkret: IP yang salah di whitelist
          adalah penyebab kegagalan pertama yang paling sering di API bergaya ini,
          dan gejalanya (rc 12) tidak pernah menyinggung bahwa masalahnya ada di
          jaringan mereka, bukan di kode mereka. */}
      <section className="glass-card flex flex-col gap-3 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <Info className="size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold">Cara tahu IP server kamu</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Sekarang kami melihat browser kamu datang dari{" "}
          <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">{browserIp}</code>.{" "}
          <strong className="text-foreground">
            Jangan langsung memasukkan angka itu ke whitelist kalau API-nya akan dipanggil dari server lain.
          </strong>{" "}
          Server hosting hampir selalu keluar dengan IP yang berbeda dari laptop kamu, dan sering kali berbeda juga dari
          IP yang tertulis di panel hosting (karena keluarnya lewat NAT).
        </p>

        <p className="text-sm text-muted-foreground">
          Cara yang pasti benar — jalankan perintah ini <strong className="text-foreground">dari server</strong> yang
          akan memanggil API:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-foreground/[0.06] p-3 text-xs">
          <code>curl {base}/api/v1/ip</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          Balasannya berisi <code className="rounded bg-foreground/10 px-1">ip</code> — itulah angka yang harus
          didaftarkan. Endpoint ini tidak butuh signature, jadi bisa dipakai sebelum integrasimu jalan. Kalau server
          kamu punya lebih dari satu jalur keluar, jalankan beberapa kali dan daftarkan semua yang muncul.
        </p>
        <p className="text-xs text-muted-foreground">
          Dari PHP:{" "}
          <code className="rounded bg-foreground/10 px-1">
            echo file_get_contents(&apos;{base}/api/v1/ip&apos;);
          </code>
        </p>
      </section>
    </div>
  );
}
