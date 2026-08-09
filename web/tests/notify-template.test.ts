import { describe, expect, it } from "vitest";
import { renderTemplate, renderPlainTemplate, escapeHtml, extractPlaceholders } from "@/lib/notify/template";

describe("renderTemplate", () => {
  it("mengganti placeholder dengan nilai vars", () => {
    expect(renderTemplate("Halo {{nama}}", { vars: { nama: "Budi" } })).toBe("Halo Budi");
  });

  it("meng-escape nilai vars - inilah yang mencegah pembeli menyuntik markup ke email toko", () => {
    // buyerEmail & nama produk ikut masuk email. Salah satunya diketik pembeli.
    const out = renderTemplate("{{email}}", { vars: { email: '<img src=x onerror="alert(1)">' } });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("menyisipkan blocks APA ADANYA karena isinya dibangun kode kita sendiri", () => {
    const out = renderTemplate("{{tabel}}", { vars: {}, blocks: { tabel: "<table><tr><td>1</td></tr></table>" } });
    expect(out).toBe("<table><tr><td>1</td></tr></table>");
  });

  it("blocks menang atas vars kalau namanya bentrok", () => {
    const out = renderTemplate("{{x}}", { vars: { x: "teks" }, blocks: { x: "<b>blok</b>" } });
    expect(out).toBe("<b>blok</b>");
  });

  it("menghapus placeholder yang tidak dikenal alih-alih menampilkannya mentah", () => {
    // "{{salah_ketik}}" yang muncul di email pelanggan terlihat seperti sistem
    // rusak; kosong cuma terlihat seperti data yang memang tidak ada.
    expect(renderTemplate("A{{salah_ketik}}B", { vars: {} })).toBe("AB");
  });

  it("mentoleransi spasi di dalam kurung", () => {
    expect(renderTemplate("{{ nama }}", { vars: { nama: "Budi" } })).toBe("Budi");
  });
});

describe("renderPlainTemplate", () => {
  it("TIDAK meng-escape - hasilnya masuk kolom chat, bukan HTML", () => {
    // Di WhatsApp/Telegram, "&amp;" akan terbaca mentah oleh penerima.
    expect(renderPlainTemplate("{{toko}}", { toko: "Dann & Shop" })).toBe("Dann & Shop");
  });

  it("placeholder tak dikenal jadi string kosong", () => {
    expect(renderPlainTemplate("A{{x}}B", {})).toBe("AB");
  });
});

describe("escapeHtml", () => {
  it("menutup kelima karakter yang bisa keluar dari konteks HTML", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("extractPlaceholders", () => {
  it("mengembalikan nama unik yang dipakai template", () => {
    expect(extractPlaceholders("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
  });
});
