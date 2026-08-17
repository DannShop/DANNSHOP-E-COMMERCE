import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Form login dua langkah.
 *
 * Langkah kedua HANYA benar kalau email & password ikut terkirim bersama kode —
 * server memverifikasi ketiganya sekaligus, dan submit kedua itulah satu-satunya
 * yang menerbitkan sesi. Kalau salah satunya hilang, yang dilihat pengguna
 * adalah "Kode autentikasi salah", karena di langkah kedua SEMUA kegagalan
 * dilaporkan sebagai kode yang salah (lihat cabang `if (totpInput)` di
 * loginAction). Gejalanya menuduh kodenya, padahal kodenya tidak pernah
 * sempat diperiksa — jenis bug yang mustahil ditebak dari layar.
 *
 * Ini bukan kasus pinggiran: React 19 ME-RESET form tak-terkendali secara
 * otomatis setiap kali sebuah form action selesai. Jadi perpindahan ke langkah
 * kedua, dengan sendirinya, mengosongkan email & password.
 */

const loginAction = vi.fn();

vi.mock("@/app/actions/auth", () => ({
  loginAction: (...args: unknown[]) => loginAction(...args),
}));

const { LoginForm } = await import("@/app/login/login-form");

/** Balasan server: password benar, lanjut ke kolom kode. */
function serverAsksForCode() {
  loginAction.mockReset();
  loginAction.mockResolvedValue({ needsTotp: true });
}

describe("LoginForm - langkah kedua 2FA", () => {
  it("mempertahankan email & password saat pindah ke langkah kedua", async () => {
    serverAsksForCode();
    const user = userEvent.setup();
    render(<LoginForm justRegistered={false} />);

    await user.type(screen.getByLabelText("Email"), "admin@dannshop.id");
    await user.type(screen.getByLabelText("Password"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));

    // Langkah kedua benar-benar muncul.
    await waitFor(() => expect(screen.getByLabelText("Kode autentikasi")).toBeInTheDocument());

    // INI penjaganya. Kalau React mengosongkan keduanya, submit berikutnya
    // mengirim kode tanpa identitas dan server menolaknya - persis gejala
    // "kode selalu salah" yang tidak bisa ditembus kode pemulihan sekalipun.
    expect(screen.getByLabelText("Email")).toHaveValue("admin@dannshop.id");
    expect(screen.getByLabelText("Password")).toHaveValue("rahasia123");
  });

  it("mengirim email, password, DAN kode pada submit kedua", async () => {
    serverAsksForCode();
    const user = userEvent.setup();
    render(<LoginForm justRegistered={false} />);

    await user.type(screen.getByLabelText("Email"), "admin@dannshop.id");
    await user.type(screen.getByLabelText("Password"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() => expect(screen.getByLabelText("Kode autentikasi")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Kode autentikasi"), "123456");
    await user.click(screen.getByRole("button", { name: "Verifikasi & Masuk" }));

    await waitFor(() => expect(loginAction).toHaveBeenCalledTimes(2));
    const formData = loginAction.mock.calls[1][1] as FormData;
    expect(formData.get("email")).toBe("admin@dannshop.id");
    expect(formData.get("password")).toBe("rahasia123");
    expect(formData.get("totp")).toBe("123456");
  });

  it("mempertahankan isian saat KODE-nya yang salah, bukan cuma saat pindah langkah", async () => {
    // Salah ketik satu angka tidak boleh melempar orang kembali ke layar email.
    loginAction.mockReset();
    loginAction.mockResolvedValue({ needsTotp: true, error: "Kode autentikasi salah atau sudah kedaluwarsa." });

    const user = userEvent.setup();
    render(<LoginForm justRegistered={false} />);

    await user.type(screen.getByLabelText("Email"), "admin@dannshop.id");
    await user.type(screen.getByLabelText("Password"), "rahasia123");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() => expect(screen.getByLabelText("Kode autentikasi")).toBeInTheDocument());

    await user.type(screen.getByLabelText("Kode autentikasi"), "000000");
    await user.click(screen.getByRole("button", { name: "Verifikasi & Masuk" }));
    await waitFor(() => expect(loginAction).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText("Email")).toHaveValue("admin@dannshop.id");
    expect(screen.getByLabelText("Password")).toHaveValue("rahasia123");
  });
});
