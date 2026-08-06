import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/site-settings";
import { renderLiteMarkdown } from "@/lib/content/lite-markdown";

export const metadata: Metadata = { title: "Kebijakan Privasi" };

export default async function PrivacyPage() {
  const { privacyContent } = await getSiteSettings();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="font-heading text-2xl font-bold">Kebijakan Privasi</h1>
      <div className="flex flex-col gap-4 text-sm text-muted-foreground">{renderLiteMarkdown(privacyContent)}</div>
    </div>
  );
}
