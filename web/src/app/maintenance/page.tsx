import type { Metadata } from "next";
import { Wrench, Clock } from "lucide-react";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Sedang Maintenance" };

export default async function MaintenancePage() {
  const { maintenanceMessage } = await getSiteSettings();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 text-center">
      {/* Ambient glow — dari primary, blur parah, kasih kesan depth */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 animate-pulse rounded-full bg-primary/25 blur-[100px] motion-reduce:animate-none sm:h-[28rem] sm:w-[28rem] sm:blur-[130px]" />
        <div
          className="absolute bottom-[10%] right-[10%] h-64 w-64 animate-pulse rounded-full bg-primary/15 blur-[100px] motion-reduce:animate-none sm:h-80 sm:w-80 sm:blur-[120px]"
          style={{ animationDelay: "1s" }}
        />
      </div>

      {/* Frosted glass card */}
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 rounded-[28px] border border-white/20 bg-white/40 p-8 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-black/40 dark:shadow-black/40 sm:p-12">
        {/* Squircle icon */}
        <div className="flex size-20 items-center justify-center rounded-[26px] bg-gradient-to-b from-primary/20 to-primary/5 shadow-inner ring-1 ring-inset ring-primary/15">
          <Wrench className="size-9 text-primary drop-shadow-sm" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Sedang Maintenance
          </h1>
          <p className="mx-auto max-w-sm text-base leading-relaxed text-muted-foreground">
            {maintenanceMessage}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-black/5 px-4 py-1.5 text-xs font-medium text-muted-foreground dark:bg-white/10">
          <Clock className="size-3.5" aria-hidden="true" />
          <span>Estimasi Selesai: Segera</span>
        </div>
      </div>
    </div>
  );
}