// Mesin template minimal untuk email & struk yang isinya boleh diedit admin.
//
// SENGAJA bukan mesin template umum (Handlebars dsb). Yang dibutuhkan cuma
// substitusi placeholder, dan setiap kemampuan tambahan - pemanggilan fungsi,
// akses properti berantai, loop - adalah permukaan serangan baru pada string
// yang berakhir sebagai HTML di kotak masuk orang lain.
//
// Dua jenis placeholder, dan perbedaannya adalah inti keamanan file ini:
//
//   vars   - nilai data (nomor order, nama produk, email pembeli). SELALU
//            di-escape. Sebagian di antaranya diketik pembeli sendiri, jadi
//            memasukkannya mentah berarti pembeli bisa menyuntikkan markup ke
//            email yang kita kirim atas nama toko.
//   blocks - potongan HTML yang DIBUAT KODE KITA (tabel rincian order, kotak
//            SN, instruksi pembayaran). Dimasukkan apa adanya karena memang
//            HTML, dan isinya tidak pernah berasal dari input mentah.
//
// Admin hanya menentukan SUSUNANNYA - mana yang di atas, teks pengantarnya apa.
// Dia tidak pernah bisa mengubah `vars` menjadi mentah.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface TemplateContext {
  vars: Record<string, string>;
  blocks?: Record<string, string>;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(PLACEHOLDER, (_match, rawName: string) => {
    const name = rawName as string;
    if (ctx.blocks && name in ctx.blocks) return ctx.blocks[name];
    if (name in ctx.vars) return escapeHtml(ctx.vars[name]);
    // Placeholder yang tidak dikenal dihapus, bukan dibiarkan tampil apa
    // adanya: "{{nama_yang_salah}}" yang muncul di email pelanggan terlihat
    // seperti sistem yang rusak, sementara kosong cuma terlihat seperti data
    // yang memang tidak ada.
    return "";
  });
}

// Versi teks polos - dipakai template pesan WhatsApp/Telegram (konfirmasi order
// manual) di mana escaping HTML justru merusak (`&amp;` yang terbaca mentah
// oleh penerima).
export function renderPlainTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_match, rawName: string) => vars[rawName as string] ?? "");
}

/** Nama placeholder yang benar-benar dipakai sebuah template - untuk validasi & bantuan di UI admin. */
export function extractPlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}
