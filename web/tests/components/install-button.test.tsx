import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallButton } from "@/components/pwa/install-button";

/**
 * Tombol pasang aplikasi.
 *
 * Logikanya hampir seluruhnya berupa DETEKSI KEMAMPUAN BROWSER, dan itu jenis
 * kode yang tidak bisa dijamin `tsc`: semua cabangnya bertipe sah, yang berbeda
 * cuma browser mana yang sedang membukanya. Di sinilah tes render membayar
 * dirinya — tiap cabang bisa dijalankan tanpa memegang empat HP berbeda.
 */

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // Chrome di iOS memakai mesin WebKit yang sama dan TIDAK BISA memasang app
  // sama sekali - menampilkan panduan di sini berarti menyuruh orang mencari
  // menu yang tidak ada di browsernya.
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126 Mobile/15E148 Safari/604.1",
};

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

/** Memalsukan "app sudah terpasang" lewat media query display-mode. */
function setStandalone(standalone: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: standalone && query.includes("standalone"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** Meniru tawaran pemasangan dari Chromium. */
function fireInstallPrompt(prompt = vi.fn().mockResolvedValue(undefined)) {
  const event = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void> };
  event.prompt = prompt;
  fireEvent(window, event);
  return prompt;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUserAgent(UA.androidChrome);
});

describe("InstallButton", () => {
  it("tidak merender apa pun sebelum browser menawarkan pemasangan", () => {
    setStandalone(false);
    setUserAgent(UA.androidChrome);
    const { container } = render(<InstallButton />);

    // Ini yang menjaga header admin tetap rapi di browser desktop yang app-nya
    // sudah terpasang atau tidak mendukung pemasangan sama sekali.
    expect(container).toBeEmptyDOMElement();
  });

  it("muncul begitu Chromium menawarkan pemasangan", async () => {
    setStandalone(false);
    setUserAgent(UA.androidChrome);
    render(<InstallButton label="Install aplikasi" />);

    fireInstallPrompt();

    expect(await screen.findByRole("button", { name: "Install aplikasi" })).toBeInTheDocument();
  });

  it("memanggil prompt bawaan browser saat diklik", async () => {
    setStandalone(false);
    setUserAgent(UA.androidChrome);
    const user = userEvent.setup();
    render(<InstallButton />);
    const prompt = fireInstallPrompt();

    await user.click(await screen.findByRole("button", { name: /install/i }));

    expect(prompt).toHaveBeenCalledOnce();
  });

  it("tidak memanggil prompt dua kali", async () => {
    // Prompt bawaan browser hangus setelah sekali pakai; memanggilnya lagi
    // melempar dan tidak menampilkan apa-apa. Tombolnya harus hilang setelah
    // dipakai, bukan diam-diam jadi tombol mati.
    setStandalone(false);
    setUserAgent(UA.androidChrome);
    const user = userEvent.setup();
    render(<InstallButton />);
    const prompt = fireInstallPrompt();

    const tombol = await screen.findByRole("button", { name: /install/i });
    await user.click(tombol);
    await waitFor(() => expect(screen.queryByRole("button", { name: /install/i })).toBeNull());

    expect(prompt).toHaveBeenCalledOnce();
  });

  it("menghilang setelah app terpasang", async () => {
    setStandalone(false);
    setUserAgent(UA.androidChrome);
    render(<InstallButton />);
    fireInstallPrompt();
    expect(await screen.findByRole("button", { name: /install/i })).toBeInTheDocument();

    fireEvent(window, new Event("appinstalled"));

    await waitFor(() => expect(screen.queryByRole("button", { name: /install/i })).toBeNull());
  });

  it("tidak merender apa pun kalau dibuka DARI app yang sudah terpasang", async () => {
    setStandalone(true);
    setUserAgent(UA.androidChrome);
    const { container } = render(<InstallButton />);

    // Bahkan kalau browsernya masih menawarkan pemasangan.
    fireInstallPrompt();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("menampilkan panduan manual di Safari iOS", async () => {
    // iOS tidak punya padanan beforeinstallprompt sama sekali, jadi tombolnya
    // harus muncul TANPA event apa pun dan membuka panduan, bukan memanggil API
    // yang tidak ada.
    setStandalone(false);
    setUserAgent(UA.iphoneSafari);
    const user = userEvent.setup();
    render(<InstallButton />);

    await user.click(await screen.findByRole("button", { name: /install/i }));

    expect(await screen.findByText(/Tambahkan ke Layar Utama/i)).toBeInTheDocument();
  });

  it("diam di Chrome iOS, yang tidak bisa memasang apa pun", async () => {
    setStandalone(false);
    setUserAgent(UA.iphoneChrome);
    const { container } = render(<InstallButton />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
