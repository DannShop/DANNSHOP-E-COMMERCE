import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = { title: "FAQ" };

export default async function FaqPage() {
  const { faqItems } = await getSiteSettings();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Pertanyaan Umum (FAQ)</h1>
      <div className="flex flex-col divide-y rounded-[var(--radius)] border">
        {faqItems.map((item, i) => (
          <details key={i} className="group p-4">
            <summary className="cursor-pointer list-none font-medium marker:content-none">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
