import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl bg-muted p-8">
        <h1 className="text-3xl font-bold">Topup Game & PPOB Otomatis</h1>
        <p className="mt-2 text-muted-foreground">
          Katalog produk hadir di Fase 2 — halaman ini placeholder fondasi.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Games", "Pulsa & Data", "E-Money"].map((c) => (
          <Card key={c}>
            <CardHeader>
              <CardTitle>{c}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Segera hadir
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
