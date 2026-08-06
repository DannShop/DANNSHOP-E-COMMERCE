import { Fragment } from "react";

// Parser super-minim khusus halaman statis (Syarat & Ketentuan, Kebijakan
// Privasi) yang admin edit lewat textarea polos - sengaja BUKAN markdown
// penuh (nggak nambah dependency baru buat 2 halaman teks). Konvensi:
// baris "## judul" -> subjudul, baris "- item" (berurutan) -> bullet list,
// baris kosong -> pemisah paragraf, sisanya -> paragraf biasa.
export function renderLiteMarkdown(text: string) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim());
        if (lines[0].startsWith("## ")) {
          return (
            <h2 key={i} className="font-semibold text-foreground">
              {lines[0].slice(3)}
              {lines.length > 1 && (
                <p className="mt-1 font-normal text-muted-foreground">{lines.slice(1).join(" ")}</p>
              )}
            </h2>
          );
        }
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {l}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
