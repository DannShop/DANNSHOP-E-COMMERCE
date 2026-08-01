import { Zap, MessageCircle, ShieldCheck } from "lucide-react";

const BADGES = [
  { icon: Zap, label: "Proses Cepat" },
  { icon: MessageCircle, label: "Layanan Chat" },
  { icon: ShieldCheck, label: "Pembayaran Aman" },
];

export function TrustBadges() {
  return (
    <div className="flex flex-wrap gap-3 rounded-lg bg-muted p-3 text-sm">
      {BADGES.map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
