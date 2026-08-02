import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    server: {
      // next-auth (dan next/server) di-import tanpa ekstensi file; Next 16 belum
      // punya "exports" map untuk subpath itu, jadi resolusi ESM native Node gagal
      // saat vite-node meng-eksternalisasi paket ini. Inline supaya diproses lewat
      // resolver Vite (lebih toleran), bukan loader ESM Node murni.
      deps: {
        inline: [/next-auth/, /^next$/],
      },
    },
  },
});
