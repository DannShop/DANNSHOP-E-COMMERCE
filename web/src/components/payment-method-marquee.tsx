import Image from "next/image";

export interface MarqueeMethod {
  id: string;
  label: string;
  logoUrl: string | null;
}

function MethodBadge({ method }: { method: MarqueeMethod }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium text-muted-foreground">
      {method.logoUrl ? (
        <span className="relative size-5 shrink-0 overflow-hidden rounded-full bg-white p-0.5">
          <Image src={method.logoUrl} alt="" fill sizes="20px" className="object-contain" unoptimized />
        </span>
      ) : null}
      <span className="whitespace-nowrap">{method.label}</span>
    </div>
  );
}

export function PaymentMethodMarquee({ methods }: { methods: MarqueeMethod[] }) {
  if (methods.length === 0) return null;

  return (
    <div className="group overflow-hidden py-2" aria-hidden={false}>
      <div className="flex w-max gap-3 animate-marquee">
        {[...methods, ...methods].map((m, i) => (
          <MethodBadge key={`${m.id}-${i}`} method={m} />
        ))}
      </div>
    </div>
  );
}
