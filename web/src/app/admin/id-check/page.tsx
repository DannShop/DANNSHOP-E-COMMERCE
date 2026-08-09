import Link from "next/link";
import { db } from "@/lib/db";
import { getIdCheckStatus } from "@/lib/catalog/id-check";
import { saveIdCheckConfigAction, testIdCheckAction } from "@/app/actions/id-check";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IdCheckForm } from "./id-check-form";

export default async function IdCheckPage() {
  const [status, products] = await Promise.all([
    getIdCheckStatus(),
    db.product.findMany({
      where: { OR: [{ idCheckEnabled: true }, { nicknameCheckKey: { not: null } }] },
      select: { id: true, name: true, idCheckEnabled: true, nicknameCheckKey: true, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Cek ID / Server Game</h1>
        <p className="text-sm text-muted-foreground">
          Menampilkan nickname akun sebelum pembeli membayar, supaya salah ketik User ID ketahuan sejak awal — bukan
          setelah diamond terlanjur masuk ke akun orang lain.
        </p>
      </div>

      <div className="rounded-lg border-l-2 border-amber-500/50 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Kenapa harus isi URL sendiri:</strong> Digiflazz tidak menyediakan validasi
        akun game (API mereka hanya punya inquiry pascabayar/PLN), jadi datanya wajib dari layanan pihak ketiga. Karena
        penyedia semacam itu sering berganti dan mati, yang dibangun di sini adalah penghubung generik — kalau
        penyedianya tumbang, kamu tinggal mengganti isian di halaman ini tanpa menunggu perubahan kode.
      </div>

      <IdCheckForm status={status} action={saveIdCheckConfigAction} testAction={testIdCheckAction} />

      <div>
        <h2 className="mb-1 text-sm font-semibold">Produk yang Terhubung</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Aktifkan per produk lewat form produk masing-masing — kolom <strong>Kode game</strong> dan centang{" "}
          <strong>Aktifkan cek ID</strong>.
        </p>
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Kode game</TableHead>
                <TableHead>Cek ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                    Belum ada produk yang diisi kode game.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {!p.isActive && <span className="ml-2 text-xs text-muted-foreground">(nonaktif)</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.nicknameCheckKey ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.idCheckEnabled ? "success" : "muted"}>
                        {p.idCheckEnabled ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
