import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { MarkdownDoc } from "@/components/markdown-doc";
import { getBaseUrl } from "@/lib/base-url";
import { getPartnerSession } from "@/lib/partner/session";

export const metadata: Metadata = { title: "Dokumentasi API" };
export const dynamic = "force-dynamic";

/**
 * Dokumentasi API yang dirender langsung dari `src/content/api-partner.md`.
 *
 * Filenya dibaca dari disk, bukan disalin ke dalam TSX, supaya hanya ada SATU
 * salinan dokumen ini di seluruh repo. Dua salinan berarti yang satu pasti
 * ketinggalan, dan yang dibaca mitra adalah yang salah.
 *
 * Perlu `outputFileTracingIncludes` di next.config.ts — tanpa itu file .md-nya
 * tidak ikut terbawa ke bundle serverless dan halaman ini 500 di produksi
 * meskipun mulus di lokal.
 */

const PLACEHOLDER_USERNAME = "tokoabc";
const PLACEHOLDER_BASE_URL = "https://dannshop.example.com";

export default async function MitraDocsPage() {
  const partner = await getPartnerSession();
  if (!partner) redirect("/account/mitra");

  const base = await getBaseUrl();
  const raw = await readFile(path.join(process.cwd(), "src", "content", "api-partner.md"), "utf8");

  // Contoh di dokumen diisi dengan nilai milik mitra ini supaya bisa
  // disalin-tempel apa adanya. `apiKey` SENGAJA dibiarkan sebagai placeholder —
  // menyuntikkan key aslinya ke halaman berarti menaruh rahasia di sumber
  // halaman dan cache browser, padahal halaman Kredensial sudah menyediakan
  // jalur yang benar untuk membacanya.
  const content = raw
    .replaceAll(PLACEHOLDER_USERNAME, partner.username)
    .replaceAll(PLACEHOLDER_BASE_URL, base);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5 rounded-xl border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
        Contoh di bawah sudah terisi username kamu (
        <code className="rounded bg-foreground/10 px-1 font-mono">{partner.username}</code>) dan alamat server kami.
        Nilai <code className="rounded bg-foreground/10 px-1 font-mono">apiKey</code> sengaja tetap berupa contoh —
        ambil yang asli di halaman <strong className="text-foreground">Kredensial</strong>.
      </div>

      {/* Gaya penyajiannya dipakai bersama dengan panduan admin lewat
          MarkdownDoc - dua salinan daftar `components` yang panjang pasti
          menyimpang, dan menyimpangnya baru kelihatan kalau ada yang
          membandingkan dua halaman berdampingan. */}
      <article className="glass-card flex flex-col gap-4 rounded-2xl p-5 text-sm leading-relaxed sm:p-7">
        <MarkdownDoc content={content} />
      </article>
    </div>
  );
}
