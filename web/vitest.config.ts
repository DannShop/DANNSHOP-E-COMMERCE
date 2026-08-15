import { defineConfig } from "vitest/config";

// DUA jenis tes yang berjalan berdampingan, dipisah lewat `projects`:
//
//   unit       - tes logika murni di lingkungan Node. 57 berkas dan terus
//                bertambah; lingkungan Node dipertahankan karena JAUH lebih
//                cepat, dan tidak ada satu pun dari tes itu yang butuh DOM.
//   components - tes render komponen React di lingkungan jsdom.
//
// Dipisah, BUKAN menjadikan jsdom lingkungan bawaan untuk semuanya: menyiapkan
// dokumen palsu untuk 57 berkas yang tidak memerlukannya menambah waktu jalan
// untuk semua orang tanpa menangkap apa pun. Pemisahannya lewat lokasi berkas
// (tests/components/**), bukan komentar magis di puncak berkas yang gampang
// terlupa saat menambah tes baru.
export default defineConfig({
  // Menggantikan plugin vite-tsconfig-paths, yang sejak Vite versi ini
  // memperingatkan bahwa resolusi `paths` dari tsconfig sudah ditangani secara
  // bawaan. Yang diselesaikan tetap sama: alias `@/*` -> `src/*`.
  resolve: { tsconfigPaths: true },
  test: {
    server: {
      // next-auth (dan next/server) di-import tanpa ekstensi file; Next 16 belum
      // punya "exports" map untuk subpath itu, jadi resolusi ESM native Node gagal
      // saat vite-node meng-eksternalisasi paket ini. Inline supaya diproses lewat
      // resolver Vite (lebih toleran), bukan loader ESM Node murni.
      deps: {
        inline: [/next-auth/, /^next$/],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          include: ["tests/components/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/setup/component-env.ts"],
        },
      },
    ],
  },
});
