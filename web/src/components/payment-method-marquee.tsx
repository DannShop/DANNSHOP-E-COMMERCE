import Image from "next/image";

export interface MarqueeMethod {
  id: string;
  label: string;
  logoUrl: string | null;
}

// Strip "Virtual Account"/"Bill Payment" dari label panjang biar strip berjalan
// cuma nampilin nama bank pendek (mis. "BCA Virtual Account" -> "BCA"). Label
// aslinya (lengkap) tetap dipakai apa adanya di picker checkout/deposit & invoice.
function shortMethodName(label: string): string {
  return label.replace(/\s+(Virtual Account|Bill Payment)$/i, "").trim();
}

function MethodBadge({ method }: { method: MarqueeMethod }) {
  const name = shortMethodName(method.label);
  return (
    <div className="flex h-12 w-28 shrink-0 items-center justify-center">
      {method.logoUrl ? (
        <span className="relative size-full">
          <Image src={method.logoUrl} alt={name} fill sizes="112px" className="object-contain" unoptimized />
        </span>
      ) : (
        <span className="whitespace-nowrap rounded-full border bg-card px-4 py-2 text-sm font-medium text-muted-foreground">
          {name}
        </span>
      )}
    </div>
  );
}

export function PaymentMethodMarquee({ methods }: { methods: MarqueeMethod[] }) {
  if (methods.length === 0) return null;

  return (
    <div className="group overflow-hidden py-2" aria-hidden={false}>
      <div className="flex w-max items-center gap-6 animate-marquee">
        {[...methods, ...methods].map((m, i) => (
          <MethodBadge key={`${m.id}-${i}`} method={m} />
        ))}
      </div>
    </div>
  );
}
