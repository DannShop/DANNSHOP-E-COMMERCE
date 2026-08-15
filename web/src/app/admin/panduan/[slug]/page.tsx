import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarkdownDoc } from "@/components/markdown-doc";
import { PANDUAN, findPanduan, readPanduan } from "@/lib/panduan/registry";

// Daftarnya tetap dan kecil, jadi seluruh halamannya bisa disiapkan saat build.
export function generateStaticParams() {
  return PANDUAN.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const panduan = findPanduan(slug);
  return { title: panduan ? `Panduan — ${panduan.title}` : "Panduan" };
}

export default async function PanduanDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panduan = findPanduan(slug);
  if (!panduan) notFound();

  const content = await readPanduan(panduan);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/admin/panduan" className="text-sm text-muted-foreground hover:underline">
        &larr; Semua panduan
      </Link>

      {panduan.audience === "Mitra" && (
        <p className="rounded-xl border-l-2 border-sky-500/50 bg-sky-500/5 p-3 text-xs text-muted-foreground">
          Ini dokumen yang sama persis dengan yang dibaca mitra di{" "}
          <span className="font-mono">/mitra/dokumentasi</span> — satu berkas, dipakai bersama. Di sana contohnya
          terisi username mitra yang sedang login; di sini tetap berupa contoh.
        </p>
      )}

      <article className="flex flex-col gap-4 rounded-2xl p-5 text-sm leading-relaxed ring-1 ring-foreground/10 sm:p-7">
        <MarkdownDoc content={content} />
      </article>
    </div>
  );
}
