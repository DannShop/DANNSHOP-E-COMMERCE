import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Penyaji dokumen Markdown untuk halaman dokumentasi di dalam aplikasi.
 *
 * Diekstrak dari /mitra/dokumentasi saat panduan admin menyusul memakai gaya
 * yang sama. Satu komponen, bukan dua salinan daftar `components` yang panjang:
 * salinan kedua pasti menyimpang, dan menyimpangnya tidak terlihat sampai ada
 * yang membandingkan dua halaman berdampingan.
 */

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

export function MarkdownDoc({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mt-2 mb-1 font-heading text-xl font-bold tracking-tight">{children}</h1>,
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
          // react-markdown memakai satu komponen untuk inline code DAN isi blok
          // kode; blok punya className "language-*", inline tidak.
          const isBlock = typeof className === "string" && className.startsWith("language-");
          if (isBlock) return <code className="font-mono text-xs">{children}</code>;
          return <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>;
        },
        // Blok kode digulir sendiri secara mendatar. Tanpa ini contoh yang
        // panjang membuat SELURUH halaman bisa digeser ke samping di HP.
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
  );
}
