import { Component, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddProductMenu } from "@/app/admin/products/add-product-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroupLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CatalogSource } from "@/lib/providers/labels";

/**
 * Berkas ini ADA KARENA SEBUAH BUG YANG SAMPAI KE PRODUKSI.
 *
 * `Menu.GroupLabel` milik Base UI membaca context grupnya dan MELEMPAR kalau
 * tidak menemukannya. Bukan peringatan: komponennya gagal render dan seluruh
 * halaman Produk jatuh ke "This page couldn't load". `tsc` dan `npm run build`
 * dua-duanya lolos — tipe-tipenya sah, dan halamannya tidak pernah dirender
 * saat build karena dinamis. Yang menemukannya pemilik toko, di produksi.
 *
 * Yang tidak bisa ditangkap pemeriksa statis adalah "komponen ini melempar saat
 * benar-benar dirender". Itu tepat yang dikunci di sini.
 */

const SOURCES: CatalogSource[] = [
  { key: "DIGIFLAZZ", label: "Digiflazz", isActive: true },
  { key: "OKECONNECT", label: "OkeConnect", isActive: false },
];

describe("AddProductMenu", () => {
  it("membuka menunya tanpa melempar", async () => {
    const user = userEvent.setup();
    render(<AddProductMenu sources={SOURCES} />);

    await user.click(screen.getByRole("button", { name: /tambah produk/i }));

    // Label grup inilah yang dulu menjatuhkan halaman. Kalau pembungkus
    // Group-nya hilang lagi, render di atas melempar dan baris ini tidak
    // pernah tercapai.
    expect(await screen.findByText("Tarik dari provider")).toBeInTheDocument();
    expect(screen.getByText("Produk manual")).toBeInTheDocument();
  });

  it("menampilkan setiap provider sebagai tautan impor", async () => {
    const user = userEvent.setup();
    render(<AddProductMenu sources={SOURCES} />);
    await user.click(screen.getByRole("button", { name: /tambah produk/i }));

    for (const source of SOURCES) {
      const link = await screen.findByRole("menuitem", { name: new RegExp(source.label, "i") });
      expect(link).toHaveAttribute("href", `/admin/products/import?provider=${source.key}`);
    }
  });

  it("menandai provider yang belum aktif", async () => {
    const user = userEvent.setup();
    render(<AddProductMenu sources={SOURCES} />);
    await user.click(screen.getByRole("button", { name: /tambah produk/i }));

    // OkeConnect isActive:false -> harus bertanda, Digiflazz tidak.
    expect(await screen.findByText("Belum aktif")).toBeInTheDocument();
    expect(screen.getAllByText("Belum aktif")).toHaveLength(1);
  });

  it("menyembunyikan seluruh bagian provider kalau belum ada satu pun", async () => {
    const user = userEvent.setup();
    render(<AddProductMenu sources={[]} />);
    await user.click(screen.getByRole("button", { name: /tambah produk/i }));

    expect(await screen.findByText("Produk manual")).toBeInTheDocument();
    // Label grup TIDAK boleh dirender sendirian tanpa isi - itu justru kondisi
    // yang membuat Base UI melempar dulu.
    expect(screen.queryByText("Tarik dari provider")).not.toBeInTheDocument();
  });
});

/**
 * Menangkap error yang dilempar SAAT RENDER.
 *
 * Tidak bisa diganti `expect(...).toThrow()`: React menangkap lemparan dari
 * pohon komponen lalu melemparkannya ulang di luar tumpukan panggilan yang
 * memicu render, jadi assertion sinkron maupun `.rejects` sama-sama tidak
 * pernah melihatnya. Error boundary adalah satu-satunya tempat React sendiri
 * menyerahkan error itu kembali ke kode kita.
 */
class TangkapError extends Component<
  { onError: (e: Error) => void; children: ReactNode },
  { mati: boolean }
> {
  state = { mati: false };
  static getDerivedStateFromError() {
    return { mati: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.mati ? null : this.props.children;
  }
}

describe("DropdownMenuGroupLabel", () => {
  it("melempar kalau dipakai di luar DropdownMenuGroup", async () => {
    // Mengunci PENYEBABNYA, bukan cuma gejalanya di satu halaman. Kalau suatu
    // hari Base UI melunak dan tidak lagi melempar, tes ini gagal dan
    // pembungkus wajib di dropdown-menu.tsx bisa ditinjau ulang dengan sadar —
    // bukan diam-diam jadi tidak relevan.
    const errors: Error[] = [];
    render(
      <TangkapError onError={(e) => errors.push(e)}>
        {/* defaultOpen supaya isinya ikut dirender saat itu juga - tanpa itu
            lemparannya baru terjadi setelah menu dibuka, di luar jangkauan
            assertion di bawah. */}
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger render={<button type="button">Buka</button>} />
          <DropdownMenuContent>
            <DropdownMenuGroupLabel>Tanpa grup</DropdownMenuGroupLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      </TangkapError>,
    );

    await waitFor(() => expect(errors).not.toHaveLength(0));
    expect(errors[0].message).toMatch(/MenuGroupContext is missing/);
  });
});
