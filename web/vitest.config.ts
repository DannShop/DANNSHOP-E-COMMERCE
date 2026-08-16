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
          // Bawaan vitest 5 detik, dan itu terlalu ketat DI SINI. Merender
          // pohon Base UI di jsdom bisa memakan beberapa detik, dan saat
          // beberapa berkas tes komponen berjalan berbarengan di mesin dengan
          // RAM terbatas, satu render yang biasanya ~3 detik pernah tembus 7.
          // Gejalanya "Test timed out", yang terbaca seperti tes rusak padahal
          // perintah yang sama lolos kalau diulang - jenis kegagalan yang
          // membuat orang berhenti mempercayai suite-nya dan mulai
          // mengabaikan kegagalan yang sungguhan.
          //
          // Hanya project components yang dilonggarkan; project unit tetap di
          // bawaan supaya tes logika yang menggantung tetap ketahuan cepat.
          testTimeout: 20_000,
        },
      },
    ],
  },
});
