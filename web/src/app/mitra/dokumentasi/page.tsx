import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

function Anchor({ href, children }: { href?: string; children?: React.ReactNode }) {
  const external = href?.startsWith("http");
  return (
    <a
      href={href}
      className="text-primary underline-offset-4 hover:underline"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

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

      <article className="glass-card flex flex-col gap-4 rounded-2xl p-5 text-sm leading-relaxed sm:p-7">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mt-2 mb-1 font-heading text-xl font-bold tracking-tight">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-6 border-t border-border/60 pt-5 font-heading text-lg font-bold tracking-tight">
                {children}
              </h2>
            ),
            h3: ({ children }) => <h3 className="mt-4 font-heading text-base font-bold">{children}</h3>,
            p: ({ children }) => <p className="text-sm text-foreground/85">{children}</p>,
            ul: ({ children }) => <ul className="ml-5 flex list-disc flex-col gap-1 text-sm">{children}</ul>,
            ol: ({ children }) => <ol className="ml-5 flex list-decimal flex-col gap-1 text-sm">{children}</ol>,
            a: Anchor,
            blockquote: ({ children }) => (
              <blockquote className="flex flex-col gap-2 rounded-r-lg border-l-2 border-amber-500/60 bg-amber-500/5 py-3 pr-3 pl-4">
                {children}
              </blockquote>
            ),
            code: ({ className, children }) => {
              // react-markdown memakai satu komponen untuk inline code DAN isi
              // blok kode; blok punya className "language-*", inline tidak.
              const isBlock = typeof className === "string" && className.startsWith("language-");
              if (isBlock) return <code className="font-mono text-xs">{children}</code>;
              return <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
            },
            // Blok kode digulir sendiri secara mendatar. Tanpa ini contoh PHP
            // yang panjang membuat SELURUH halaman bisa digeser ke samping di HP.
            pre: ({ children }) => (
              <pre className="overflow-x-auto rounded-lg bg-foreground/[0.06] p-3 text-xs">{children}</pre>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <table className="w-full text-left text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-foreground/[0.04]">{children}</thead>,
            th: ({ children }) => <th className="border-b border-border/60 px-3 py-2 font-semibold">{children}</th>,
            td: ({ children }) => <td className="border-b border-border/40 px-3 py-2 align-top">{children}</td>,
            hr: () => <hr className="border-border/60" />,
          }}
        >
          {content}
        </Markdown>
      </article>
    </div>
  );
}
