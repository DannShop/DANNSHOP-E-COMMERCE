import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { getSiteSettings } from "@/lib/site-settings";

export const metadata: Metadata = { title: "Sedang Maintenance" };

export default async function MaintenancePage() {
  const { maintenanceMessage } = await getSiteSettings();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Wrench className="size-8 text-primary" aria-hidden="true" />
      </div>
      <h1 className="font-heading text-2xl font-bold">Sedang Maintenance</h1>
      <p className="max-w-md text-muted-foreground">{maintenanceMessage}</p>
    </div>
  );
}
