/**
 * Kerangka sementara portal mitra.
 *
 * Setiap halaman /mitra/* memakai `force-dynamic` dan menembak TiDB Cloud —
 * yang berjalan serverless dan bisa perlu satu detik lebih hanya untuk bangun
 * dari idle. TANPA file ini, Next menahan seluruh navigasi sampai query
 * terakhir selesai: sidebar, header, dan menu ikut membeku, dan dari sisi mitra
 * itu terlihat seperti aplikasi yang menggantung.
 *
 * Dengan file ini, kerangka portal (yang datanya sudah ada di layout) langsung
 * tampil dan HANYA area kontennya yang menunggu. Waktu totalnya sama; yang
 * berubah adalah portalnya terasa hidup sejak ketukan pertama.
 *
 * `animate-pulse` saja — tanpa spinner: blok abu-abu yang bentuknya menyerupai
 * isi halaman membuat perpindahan terasa mulus, bukan seperti layar dimuat ulang.
 */
export default function MitraLoading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat…</span>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-card flex flex-col gap-2 rounded-2xl p-4">
            <div className="h-3 w-20 rounded bg-foreground/10" />
            <div className="h-6 w-28 rounded bg-foreground/10" />
          </div>
        ))}
      </div>

      <div className="glass-card flex flex-col gap-3 rounded-2xl p-5">
        <div className="h-4 w-40 rounded bg-foreground/10" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 flex-1 rounded bg-foreground/10" />
            <div className="h-3 w-20 shrink-0 rounded bg-foreground/10" />
            <div className="h-5 w-16 shrink-0 rounded-full bg-foreground/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
