# Fase 2: Katalog + Integrasi Digiflazz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Katalog produk dikelola dari admin, price list Digiflazz ter-sync ke DB, dan transaksi tes ke Digiflazz sukses dari admin panel.

**Architecture:** Provider adapter pattern (`TopupProviderAdapter`) dengan Digiflazz sebagai adapter pertama; kredensial provider dienkripsi AES-256-GCM di kolom `ProviderConfig.credentials`; sync harga & pekerjaan berkala berjalan lewat job queue MySQL (tabel `Job`) yang dipicu endpoint cron `/api/cron/tick`. Admin panel (server components + server actions) untuk CRUD produk, mapping SKU, dan operasi provider.

**Tech Stack:** Next.js 16.2.10 App Router, TypeScript strict, Prisma 6 + MySQL, Zod v4, Vitest, shadcn/ui + Tailwind 4.

## Global Constraints

- Semua kerja di folder `web/` (app Next.js). Laravel di root repo = referensi, JANGAN disentuh.
- Branch kerja: `fase-2-katalog`, dibuat dari `main` setelah PR fase-1 di-merge (fallback: dari `fase-1-fondasi` — tree-nya identik).
- **Prisma tetap v6** (`@prisma/client ^6.19.3`) — JANGAN upgrade ke v7 (keputusan Fase 1).
- **Zod v4 API** — pakai `z.email()`, `z.coerce.number()`, dsb; bukan API deprecated v3.
- Uang selalu `BigInt` rupiah utuh — tanpa float. Saat render ke UI, konversi via `Number()` hanya untuk display.
- Bahasa UI & pesan error: Indonesia. Komentar kode: Indonesia (ikuti gaya existing).
- Skema Prisma **sudah lengkap** (18 model) — fase ini TIDAK mengubah schema, TIDAK ada migrasi baru.
- Test: `cd web && npx vitest run <file>` (semua test file di `web/tests/*.test.ts`, environment node).
- Commit convention: `feat(web): ...` / `test(web): ...` / `chore(web): ...` + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Env baru yang dibutuhkan (tambahkan ke `web/.env` + `web/.env.example` di Task 1 & 8): `CREDENTIALS_ENCRYPTION_KEY` (hex 64 char = 32 byte), `CRON_SECRET` (string acak).
- Task UI admin (Task 9–12): implementer WAJIB memakai skill `ui-ux-pro-max` saat menyusun halaman.
- Digiflazz endpoint & signature sudah TERVERIFIKASI dari developer.digiflazz.com (spec §5.2) — jangan tebak field di luar yang tertulis di plan ini.

## Setup (sebelum Task 1)

```bash
cd "D:/Coding VSC/DannShop-PPOB"
git fetch origin
# Kalau PR fase-1 sudah merged:
git checkout main && git pull && git checkout -b fase-2-katalog
# Kalau BELUM merged (fallback):
git checkout fase-1-fondasi && git pull && git checkout -b fase-2-katalog
cd web && npm install && npx vitest run   # baseline: semua test existing PASS
```

---

### Task 1: Util enkripsi kredensial (AES-256-GCM)

**Files:**
- Create: `web/src/lib/crypto.ts`
- Test: `web/tests/crypto.test.ts`
- Modify: `web/.env.example` (tambah `CREDENTIALS_ENCRYPTION_KEY`)

**Interfaces:**
- Consumes: —
- Produces: `encryptJson(value: unknown): string` (format `v1:<iv-b64>:<tag-b64>:<cipher-b64>`), `decryptJson<T>(payload: string): T`. Task 6 memakai ini untuk kolom `ProviderConfig.credentials`.

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/crypto.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { encryptJson, decryptJson } from "@/lib/crypto";

beforeAll(() => {
  // key 32 byte (64 hex char) khusus test
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
});

describe("crypto kredensial", () => {
  it("encrypt lalu decrypt kembali sama", () => {
    const creds = { username: "wildan", apiKey: "rahasia-123" };
    const enc = encryptJson(creds);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("rahasia-123");
    expect(decryptJson(enc)).toEqual(creds);
  });

  it("dua kali encrypt menghasilkan ciphertext berbeda (IV acak)", () => {
    const a = encryptJson({ x: 1 });
    const b = encryptJson({ x: 1 });
    expect(a).not.toBe(b);
  });

  it("payload yang diubah ditolak (GCM auth tag)", () => {
    const enc = encryptJson({ x: 1 });
    const parts = enc.split(":");
    parts[3] = Buffer.from("berubah!").toString("base64");
    expect(() => decryptJson(parts.join(":"))).toThrow();
  });

  it("key env belum di-set → error jelas", () => {
    const saved = process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptJson({ x: 1 })).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/crypto.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Enkripsi kredensial provider sebelum disimpan ke DB (spec §11).
// Format payload: v1:<iv b64>:<authTag b64>:<ciphertext b64>

function key(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY wajib di-set di env (64 hex char / 32 byte).",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptJson<T = unknown>(payload: string): T {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Format payload terenkripsi tidak dikenal.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString("utf8")) as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/crypto.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Tambah env example + commit**

Tambahkan baris berikut ke `web/.env.example`:

```
CREDENTIALS_ENCRYPTION_KEY="isi-64-hex-char-hasil: openssl rand -hex 32"
```

```bash
git add web/src/lib/crypto.ts web/tests/crypto.test.ts web/.env.example
git commit -m "feat(web): util enkripsi kredensial provider (AES-256-GCM)"
```

---

### Task 2: Tipe adapter provider + helper signature Digiflazz

**Files:**
- Create: `web/src/lib/providers/types.ts`
- Create: `web/src/lib/providers/digiflazz-sign.ts`
- Test: `web/tests/digiflazz-sign.test.ts`

**Interfaces:**
- Consumes: —
- Produces (dipakai Task 3–8, 12):

```ts
// types.ts — kontrak seragam semua provider (spec §5.1)
export type ProviderKeyLower = "digiflazz" | "okeconnect" | "qiospay" | "serpul";

export interface ProviderSkuPrice {
  skuCode: string;        // buyer_sku_code
  productName: string;
  category: string;
  brand: string;
  costPrice: bigint;      // rupiah utuh
  available: boolean;     // buyer & seller status keduanya aktif
}

export type TrxStatus = "success" | "pending" | "failed";

export interface ProviderTrxResult {
  refId: string;
  status: TrxStatus;
  sn: string | null;
  message: string;
  costPrice: bigint | null;
  raw: unknown;
}

export interface CallbackResult {
  refId: string;
  status: TrxStatus;
  sn: string | null;
  message: string;
  verified: boolean;
  raw: unknown;
}

export interface CreateTrxInput {
  skuCode: string;
  target: string;   // customer_no gabungan (mis. userid+zoneid) — pembentukan format = urusan pemanggil
  refId: string;    // our_ref_id, unik per attempt, kunci idempotency
  testing?: boolean; // mode tes Digiflazz (transaksi simulasi)
}

export interface TopupProviderAdapter {
  readonly key: ProviderKeyLower;
  fetchPriceList(): Promise<ProviderSkuPrice[]>;
  fetchBalance(): Promise<bigint>;
  createTransaction(input: CreateTrxInput): Promise<ProviderTrxResult>;
  // DEVIASI dari spec §5.1 (checkStatus(refId)): Digiflazz cek status = kirim ulang
  // request transaksi yang sama persis (idempotent by ref_id), jadi butuh input lengkap.
  checkStatus(input: CreateTrxInput): Promise<ProviderTrxResult>;
  parseCallback(input: { rawBody: string; headers: Record<string, string> }): CallbackResult | null;
}
```

```ts
// digiflazz-sign.ts
export function digiflazzSign(username: string, apiKey: string, salt: string): string; // md5(username+apiKey+salt)
export function verifyDigiflazzWebhookSignature(rawBody: string, secret: string, header: string | undefined): boolean; // "sha1=<hmac>"
```

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/digiflazz-sign.test.ts
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { digiflazzSign, verifyDigiflazzWebhookSignature } from "@/lib/providers/digiflazz-sign";

describe("digiflazzSign", () => {
  it("md5(username + apiKey + salt) sesuai docs", () => {
    const expected = createHash("md5").update("userXkeyYpricelist").digest("hex");
    expect(digiflazzSign("userX", "keyY", "pricelist")).toBe(expected);
  });
});

describe("verifyDigiflazzWebhookSignature", () => {
  const secret = "webhook-secret";
  const body = JSON.stringify({ data: { ref_id: "DS-1" } });
  const goodSig = "sha1=" + createHmac("sha1", secret).update(body).digest("hex");

  it("signature benar → true", () => {
    expect(verifyDigiflazzWebhookSignature(body, secret, goodSig)).toBe(true);
  });

  it("signature salah → false", () => {
    expect(verifyDigiflazzWebhookSignature(body, secret, "sha1=" + "0".repeat(40))).toBe(false);
  });

  it("header hilang / format aneh → false", () => {
    expect(verifyDigiflazzWebhookSignature(body, secret, undefined)).toBe(false);
    expect(verifyDigiflazzWebhookSignature(body, secret, "bukan-format")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/digiflazz-sign.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Buat `web/src/lib/providers/types.ts` persis seperti blok Interfaces di atas (interface + type saja, tanpa logic), lalu:

```ts
// web/src/lib/providers/digiflazz-sign.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Signature request Digiflazz: md5(username + apiKey + salt)
// salt = "pricelist" | "depo" | ref_id transaksi (spec §5.2)
export function digiflazzSign(username: string, apiKey: string, salt: string): string {
  return createHash("md5").update(`${username}${apiKey}${salt}`).digest("hex");
}

// Webhook Digiflazz: header X-Hub-Signature = "sha1=" + HMAC-SHA1(rawBody, secret)
export function verifyDigiflazzWebhookSignature(
  rawBody: string,
  secret: string,
  header: string | undefined,
): boolean {
  if (!header || !header.startsWith("sha1=")) return false;
  const expected = createHmac("sha1", secret).update(rawBody).digest("hex");
  const given = header.slice("sha1=".length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/digiflazz-sign.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/providers/types.ts web/src/lib/providers/digiflazz-sign.ts web/tests/digiflazz-sign.test.ts
git commit -m "feat(web): kontrak TopupProviderAdapter + signature helper Digiflazz"
```

---

### Task 3: DigiflazzAdapter — fetchPriceList + fetchBalance

**Files:**
- Create: `web/src/lib/providers/digiflazz.ts`
- Test: `web/tests/digiflazz-adapter.test.ts`

**Interfaces:**
- Consumes: `digiflazzSign` (Task 2), tipe dari `types.ts` (Task 2)
- Produces: `class DigiflazzAdapter implements TopupProviderAdapter`, konstruktor `new DigiflazzAdapter(creds: DigiflazzCredentials, baseUrl?: string)` dengan `export interface DigiflazzCredentials { username: string; apiKey: string; webhookSecret?: string }`. `createTransaction`/`checkStatus`/`parseCallback` boleh sementara `throw new Error("belum diimplementasi")` (diisi Task 4–5).

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/digiflazz-adapter.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { DigiflazzAdapter } from "@/lib/providers/digiflazz";

const creds = { username: "userX", apiKey: "keyY" };

function mockFetchOnce(json: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("DigiflazzAdapter.fetchPriceList", () => {
  it("POST /price-list dengan cmd prepaid + sign md5(...pricelist), map ke ProviderSkuPrice", async () => {
    const fn = mockFetchOnce({
      data: [
        {
          buyer_sku_code: "ML86", product_name: "86 Diamonds", category: "Games",
          brand: "MOBILE LEGENDS", price: 19750,
          buyer_product_status: true, seller_product_status: true,
        },
        {
          buyer_sku_code: "FF100", product_name: "100 Diamond", category: "Games",
          brand: "FREE FIRE", price: 14000,
          buyer_product_status: true, seller_product_status: false, // seller off → tidak available
        },
      ],
    });

    const adapter = new DigiflazzAdapter(creds);
    const rows = await adapter.fetchPriceList();

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.digiflazz.com/v1/price-list");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.cmd).toBe("prepaid");
    expect(body.username).toBe("userX");
    expect(body.sign).toMatch(/^[0-9a-f]{32}$/);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      skuCode: "ML86", productName: "86 Diamonds", category: "Games",
      brand: "MOBILE LEGENDS", costPrice: 19750n, available: true,
    });
    expect(rows[1].available).toBe(false);
  });

  it("response bukan shape yang diharapkan → throw error jelas", async () => {
    mockFetchOnce({ data: { message: "Invalid Signature" } });
    const adapter = new DigiflazzAdapter(creds);
    await expect(adapter.fetchPriceList()).rejects.toThrow(/Digiflazz/);
  });
});

describe("DigiflazzAdapter.fetchBalance", () => {
  it("POST /cek-saldo cmd deposit → bigint", async () => {
    const fn = mockFetchOnce({ data: { deposit: 1_500_000 } });
    const adapter = new DigiflazzAdapter(creds);
    expect(await adapter.fetchBalance()).toBe(1_500_000n);
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.cmd).toBe("deposit");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/digiflazz-adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/providers/digiflazz.ts
import { z } from "zod";
import { digiflazzSign, verifyDigiflazzWebhookSignature } from "./digiflazz-sign";
import type {
  CallbackResult, CreateTrxInput, ProviderSkuPrice, ProviderTrxResult,
  TopupProviderAdapter,
} from "./types";

export interface DigiflazzCredentials {
  username: string;
  apiKey: string;
  webhookSecret?: string;
}

// Shape row price-list prepaid — TERVERIFIKASI dari developer.digiflazz.com (spec §5.2)
const priceRowSchema = z.object({
  buyer_sku_code: z.string(),
  product_name: z.string(),
  category: z.string(),
  brand: z.string(),
  price: z.number(),
  buyer_product_status: z.boolean(),
  seller_product_status: z.boolean(),
});

const priceListSchema = z.object({ data: z.array(priceRowSchema) });
const balanceSchema = z.object({ data: z.object({ deposit: z.number() }) });

const BASE_URL = "https://api.digiflazz.com/v1";

export class DigiflazzAdapter implements TopupProviderAdapter {
  readonly key = "digiflazz" as const;

  constructor(
    private creds: DigiflazzCredentials,
    private baseUrl: string = BASE_URL,
  ) {}

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // Digiflazz membalas error dalam body JSON (bukan selalu non-200) — parse dulu, validasi di caller.
    return res.json();
  }

  async fetchPriceList(): Promise<ProviderSkuPrice[]> {
    const raw = await this.post("/price-list", {
      cmd: "prepaid",
      username: this.creds.username,
      sign: digiflazzSign(this.creds.username, this.creds.apiKey, "pricelist"),
    });
    const parsed = priceListSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Digiflazz price-list: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
    }
    return parsed.data.data.map((r) => ({
      skuCode: r.buyer_sku_code,
      productName: r.product_name,
      category: r.category,
      brand: r.brand,
      costPrice: BigInt(Math.round(r.price)),
      available: r.buyer_product_status && r.seller_product_status,
    }));
  }

  async fetchBalance(): Promise<bigint> {
    const raw = await this.post("/cek-saldo", {
      cmd: "deposit",
      username: this.creds.username,
      sign: digiflazzSign(this.creds.username, this.creds.apiKey, "depo"),
    });
    const parsed = balanceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Digiflazz cek-saldo: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
    }
    return BigInt(Math.round(parsed.data.data.deposit));
  }

  async createTransaction(_input: CreateTrxInput): Promise<ProviderTrxResult> {
    throw new Error("belum diimplementasi (Task 4)");
  }

  async checkStatus(_input: CreateTrxInput): Promise<ProviderTrxResult> {
    throw new Error("belum diimplementasi (Task 4)");
  }

  parseCallback(_input: { rawBody: string; headers: Record<string, string> }): CallbackResult | null {
    throw new Error("belum diimplementasi (Task 5)");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/digiflazz-adapter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/providers/digiflazz.ts web/tests/digiflazz-adapter.test.ts
git commit -m "feat(web): DigiflazzAdapter price-list + cek saldo (TDD, fetch dimock)"
```

---

### Task 4: DigiflazzAdapter — createTransaction + checkStatus

**Files:**
- Modify: `web/src/lib/providers/digiflazz.ts` (ganti stub `createTransaction`/`checkStatus`)
- Test: `web/tests/digiflazz-adapter.test.ts` (tambah describe block)

**Interfaces:**
- Consumes: `CreateTrxInput`, `ProviderTrxResult` (Task 2)
- Produces: implementasi penuh `createTransaction(input)` dan `checkStatus(input)` (checkStatus = kirim ulang request yang sama, idempotent by ref_id). Mapping status: `Sukses`/rc `00` → `success`; `Pending`/rc `03` → `pending`; selain itu → `failed`.

- [ ] **Step 1: Write the failing test** (tambahkan di `web/tests/digiflazz-adapter.test.ts`)

```ts
describe("DigiflazzAdapter.createTransaction", () => {
  it("POST /transaction dengan sign md5(user+key+refId), map Pending", async () => {
    const fn = mockFetchOnce({
      data: {
        ref_id: "DS-F2-1", status: "Pending", message: "PROSES", rc: "03",
        sn: "", price: 19750, buyer_last_saldo: 1000000,
      },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.createTransaction({
      skuCode: "ML86", target: "1234567891234", refId: "DS-F2-1",
    });

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe("https://api.digiflazz.com/v1/transaction");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      username: "userX", buyer_sku_code: "ML86", customer_no: "1234567891234", ref_id: "DS-F2-1",
    });
    expect(body.testing).toBeUndefined(); // hanya dikirim kalau diminta

    expect(result.status).toBe("pending");
    expect(result.refId).toBe("DS-F2-1");
    expect(result.costPrice).toBe(19750n);
  });

  it("status Sukses + rc 00 → success dengan SN", async () => {
    mockFetchOnce({
      data: { ref_id: "DS-F2-2", status: "Sukses", message: "OK", rc: "00", sn: "SN123456", price: 19750 },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.createTransaction({ skuCode: "ML86", target: "123", refId: "DS-F2-2" });
    expect(result.status).toBe("success");
    expect(result.sn).toBe("SN123456");
  });

  it("status Gagal → failed, message diteruskan", async () => {
    mockFetchOnce({
      data: { ref_id: "DS-F2-3", status: "Gagal", message: "Saldo tidak cukup", rc: "40", sn: "" },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.createTransaction({ skuCode: "ML86", target: "123", refId: "DS-F2-3" });
    expect(result.status).toBe("failed");
    expect(result.message).toBe("Saldo tidak cukup");
    expect(result.sn).toBeNull();
  });

  it("testing:true ikut terkirim di body", async () => {
    const fn = mockFetchOnce({
      data: { ref_id: "DS-F2-4", status: "Pending", message: "", rc: "03", sn: "" },
    });
    const adapter = new DigiflazzAdapter(creds);
    await adapter.createTransaction({ skuCode: "ML86", target: "123", refId: "DS-F2-4", testing: true });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.testing).toBe(true);
  });

  it("checkStatus mengirim request identik dengan createTransaction (idempotent by ref_id)", async () => {
    const fn = mockFetchOnce({
      data: { ref_id: "DS-F2-1", status: "Sukses", message: "OK", rc: "00", sn: "SN-AKHIR" },
    });
    const adapter = new DigiflazzAdapter(creds);
    const result = await adapter.checkStatus({ skuCode: "ML86", target: "1234567891234", refId: "DS-F2-1" });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.ref_id).toBe("DS-F2-1");
    expect(result.status).toBe("success");
    expect(result.sn).toBe("SN-AKHIR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/digiflazz-adapter.test.ts`
Expected: FAIL — "belum diimplementasi (Task 4)"

- [ ] **Step 3: Write implementation** (ganti kedua stub di `digiflazz.ts`)

```ts
// Tambah di bagian schema (dekat priceRowSchema):
const trxDataSchema = z.object({
  ref_id: z.string(),
  status: z.string(),          // "Pending" | "Sukses" | "Gagal"
  message: z.string().optional().default(""),
  rc: z.string().optional().default(""),
  sn: z.string().optional().default(""),
  price: z.number().optional(),
});
const trxSchema = z.object({ data: trxDataSchema });

// Mapping status Digiflazz → TrxStatus internal (spec §5.2: rc 00 sukses, 03 pending)
function mapTrxStatus(status: string, rc: string): "success" | "pending" | "failed" {
  if (status === "Sukses" || rc === "00") return "success";
  if (status === "Pending" || rc === "03") return "pending";
  return "failed";
}

// Ganti stub:
async createTransaction(input: CreateTrxInput): Promise<ProviderTrxResult> {
  const body: Record<string, unknown> = {
    username: this.creds.username,
    buyer_sku_code: input.skuCode,
    customer_no: input.target,
    ref_id: input.refId,
    sign: digiflazzSign(this.creds.username, this.creds.apiKey, input.refId),
  };
  if (input.testing) body.testing = true;

  const raw = await this.post("/transaction", body);
  const parsed = trxSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Digiflazz transaction: response tidak sesuai (${JSON.stringify(raw).slice(0, 200)})`);
  }
  const d = parsed.data.data;
  return {
    refId: d.ref_id,
    status: mapTrxStatus(d.status, d.rc),
    sn: d.sn ? d.sn : null,
    message: d.message,
    costPrice: d.price !== undefined ? BigInt(Math.round(d.price)) : null,
    raw,
  };
}

// Cek status Digiflazz = kirim ulang request transaksi yang sama persis.
// Digiflazz idempotent by ref_id — tidak akan dobel eksekusi (spec §5.2).
async checkStatus(input: CreateTrxInput): Promise<ProviderTrxResult> {
  return this.createTransaction(input);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/digiflazz-adapter.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/providers/digiflazz.ts web/tests/digiflazz-adapter.test.ts
git commit -m "feat(web): DigiflazzAdapter createTransaction + checkStatus idempotent"
```

---

### Task 5: DigiflazzAdapter — parseCallback + verifikasi HMAC

**Files:**
- Modify: `web/src/lib/providers/digiflazz.ts` (ganti stub `parseCallback`)
- Test: `web/tests/digiflazz-adapter.test.ts` (tambah describe block)

**Interfaces:**
- Consumes: `verifyDigiflazzWebhookSignature` (Task 2)
- Produces: `parseCallback({ rawBody, headers })` → `CallbackResult | null`. Header dicek case-insensitive (`x-hub-signature`). Tanpa `webhookSecret` di creds → `verified: false` (tidak pernah throw). Body tak dikenal → `null`.

- [ ] **Step 1: Write the failing test** (tambahkan di test file yang sama)

```ts
import { createHmac } from "node:crypto";

describe("DigiflazzAdapter.parseCallback", () => {
  const secret = "hook-secret";
  const credsWithHook = { ...creds, webhookSecret: secret };
  const bodyObj = {
    data: { ref_id: "DS-F2-1", customer_no: "123", buyer_sku_code: "ML86",
            status: "Sukses", message: "OK", sn: "SN789", rc: "00" },
  };
  const rawBody = JSON.stringify(bodyObj);
  const sig = "sha1=" + createHmac("sha1", secret).update(rawBody).digest("hex");

  it("signature valid → verified true + status ter-map", () => {
    const adapter = new DigiflazzAdapter(credsWithHook);
    const result = adapter.parseCallback({ rawBody, headers: { "x-hub-signature": sig } });
    expect(result).not.toBeNull();
    expect(result!.verified).toBe(true);
    expect(result!.refId).toBe("DS-F2-1");
    expect(result!.status).toBe("success");
    expect(result!.sn).toBe("SN789");
  });

  it("signature salah → verified false (payload tetap ter-parse)", () => {
    const adapter = new DigiflazzAdapter(credsWithHook);
    const result = adapter.parseCallback({
      rawBody, headers: { "x-hub-signature": "sha1=" + "0".repeat(40) },
    });
    expect(result!.verified).toBe(false);
  });

  it("body bukan format Digiflazz → null", () => {
    const adapter = new DigiflazzAdapter(credsWithHook);
    expect(adapter.parseCallback({ rawBody: "{\"halo\":1}", headers: {} })).toBeNull();
    expect(adapter.parseCallback({ rawBody: "bukan json", headers: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/digiflazz-adapter.test.ts`
Expected: FAIL — "belum diimplementasi (Task 5)"

- [ ] **Step 3: Write implementation** (ganti stub `parseCallback`)

```ts
// Tambah schema callback (field sama dengan trxDataSchema, tanpa price wajib):
const callbackSchema = z.object({ data: trxDataSchema.omit({ price: true }).extend({ price: z.number().optional() }) });

parseCallback(input: { rawBody: string; headers: Record<string, string> }): CallbackResult | null {
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return null;
  }
  const parsed = callbackSchema.safeParse(json);
  if (!parsed.success) return null;

  // Cari header case-insensitive
  const sigHeader = Object.entries(input.headers).find(
    ([k]) => k.toLowerCase() === "x-hub-signature",
  )?.[1];

  const verified = this.creds.webhookSecret
    ? verifyDigiflazzWebhookSignature(input.rawBody, this.creds.webhookSecret, sigHeader)
    : false;

  const d = parsed.data.data;
  return {
    refId: d.ref_id,
    status: mapTrxStatus(d.status, d.rc),
    sn: d.sn ? d.sn : null,
    message: d.message,
    verified,
    raw: json,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/digiflazz-adapter.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/providers/digiflazz.ts web/tests/digiflazz-adapter.test.ts
git commit -m "feat(web): DigiflazzAdapter parseCallback + verifikasi HMAC-SHA1"
```

---

### Task 6: Registry adapter (load ProviderConfig dari DB + decrypt kredensial)

**Files:**
- Create: `web/src/lib/providers/registry.ts`
- Test: `web/tests/provider-registry.test.ts`

**Interfaces:**
- Consumes: `decryptJson` (Task 1), `DigiflazzAdapter`, `DigiflazzCredentials` (Task 3)
- Produces:

```ts
// Dipakai Task 7, 8, 9, 12. dbClient di-inject supaya bisa di-test tanpa MySQL.
export async function getAdapter(
  key: "DIGIFLAZZ" | "OKECONNECT" | "QIOSPAY" | "SERPUL",
  dbClient?: { providerConfig: { findUnique: Function } }, // default: db dari @/lib/db
): Promise<TopupProviderAdapter>;
// Throw kalau: config tidak ada, credentials null, atau provider belum didukung (selain DIGIFLAZZ).
```

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/provider-registry.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { encryptJson } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers/registry";

beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
});

function fakeDb(row: unknown) {
  return { providerConfig: { findUnique: async () => row } } as never;
}

describe("getAdapter", () => {
  it("DIGIFLAZZ dengan kredensial terenkripsi → DigiflazzAdapter", async () => {
    const row = {
      key: "DIGIFLAZZ", isActive: true,
      credentials: encryptJson({ username: "userX", apiKey: "keyY" }),
    };
    const adapter = await getAdapter("DIGIFLAZZ", fakeDb(row));
    expect(adapter.key).toBe("digiflazz");
  });

  it("config tidak ada → error jelas", async () => {
    await expect(getAdapter("DIGIFLAZZ", fakeDb(null))).rejects.toThrow(/belum dikonfigurasi/);
  });

  it("credentials kosong → error jelas", async () => {
    const row = { key: "DIGIFLAZZ", isActive: true, credentials: null };
    await expect(getAdapter("DIGIFLAZZ", fakeDb(row))).rejects.toThrow(/kredensial/i);
  });

  it("provider belum didukung → error jelas", async () => {
    const row = { key: "SERPUL", isActive: true, credentials: encryptJson({}) };
    await expect(getAdapter("SERPUL", fakeDb(row))).rejects.toThrow(/belum didukung/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/provider-registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/providers/registry.ts
import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { DigiflazzAdapter, type DigiflazzCredentials } from "./digiflazz";
import type { TopupProviderAdapter } from "./types";

type DbLike = { providerConfig: { findUnique: (args: { where: { key: ProviderKey } }) => Promise<{ credentials: unknown } | null> } };

// Satu-satunya jalan membuat adapter dari konfigurasi DB.
// Kredensial disimpan terenkripsi (Task 1) — didecrypt di sini, tidak pernah bocor ke client.
export async function getAdapter(
  key: ProviderKey,
  dbClient: DbLike = db as unknown as DbLike,
): Promise<TopupProviderAdapter> {
  const config = await dbClient.providerConfig.findUnique({ where: { key } });
  if (!config) throw new Error(`Provider ${key} belum dikonfigurasi di database.`);
  if (typeof config.credentials !== "string" || config.credentials.length === 0) {
    throw new Error(`Provider ${key} belum punya kredensial tersimpan.`);
  }

  switch (key) {
    case "DIGIFLAZZ":
      return new DigiflazzAdapter(decryptJson<DigiflazzCredentials>(config.credentials));
    default:
      throw new Error(`Provider ${key} belum didukung (adapter menyusul di Fase 5).`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/provider-registry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/providers/registry.ts web/tests/provider-registry.test.ts
git commit -m "feat(web): registry adapter provider (load config DB + decrypt kredensial)"
```

---

### Task 7: Sync harga — diff pure function + orchestrator

**Files:**
- Create: `web/src/lib/catalog/price-sync.ts`
- Test: `web/tests/price-sync.test.ts`

**Interfaces:**
- Consumes: `ProviderSkuPrice` (Task 2), `getAdapter` (Task 6)
- Produces:

```ts
// Pure — di-test penuh:
export interface CurrentSku { id: string; providerSkuCode: string; costPrice: bigint; status: "ACTIVE" | "UNAVAILABLE" }
export interface SkuUpdate { id: string; costPrice: bigint; status: "ACTIVE" | "UNAVAILABLE" }
export function diffPriceList(current: CurrentSku[], fetched: ProviderSkuPrice[]): { updates: SkuUpdate[]; missingCount: number };

// Orchestrator tipis (dipanggil job handler Task 8 & tombol admin Task 9):
export async function runPriceSync(providerKey: ProviderKey): Promise<{ updated: number; missing: number }>;
// Alur: buat PriceSyncLog (startedAt) → getAdapter → fetchPriceList → ambil ProviderSku existing
// milik provider itu → diffPriceList → update per-row + lastSyncedAt=now →
// update PriceSyncLog (finishedAt, skusUpdated, skusMissing, result="ok").
// Error → PriceSyncLog.error terisi, lalu re-throw.
```

Catatan desain: sync TIDAK membuat `ProviderSku` baru — mapping SKU dibuat admin (Task 11). Sync hanya meng-update `costPrice` + `status` row yang sudah ada; SKU yang hilang dari price list atau `available=false` → `UNAVAILABLE` (spec §5.5).

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/price-sync.test.ts
import { describe, expect, it } from "vitest";
import { diffPriceList, type CurrentSku } from "@/lib/catalog/price-sync";
import type { ProviderSkuPrice } from "@/lib/providers/types";

const fetchedRow = (over: Partial<ProviderSkuPrice>): ProviderSkuPrice => ({
  skuCode: "ML86", productName: "86 Diamonds", category: "Games",
  brand: "MOBILE LEGENDS", costPrice: 19750n, available: true, ...over,
});

describe("diffPriceList", () => {
  const current: CurrentSku[] = [
    { id: "1", providerSkuCode: "ML86", costPrice: 19000n, status: "ACTIVE" },
    { id: "2", providerSkuCode: "FF100", costPrice: 14000n, status: "ACTIVE" },
    { id: "3", providerSkuCode: "HILANG1", costPrice: 5000n, status: "ACTIVE" },
  ];

  it("harga berubah → update costPrice; SKU hilang → UNAVAILABLE", () => {
    const fetched = [
      fetchedRow({ skuCode: "ML86", costPrice: 19750n }),
      fetchedRow({ skuCode: "FF100", costPrice: 14000n }),
      // HILANG1 tidak ada di price list
    ];
    const { updates, missingCount } = diffPriceList(current, fetched);

    expect(updates).toContainEqual({ id: "1", costPrice: 19750n, status: "ACTIVE" });
    expect(updates).toContainEqual({ id: "3", costPrice: 5000n, status: "UNAVAILABLE" });
    expect(missingCount).toBe(1);
  });

  it("available=false di provider → UNAVAILABLE walau masih di list", () => {
    const fetched = [fetchedRow({ skuCode: "ML86", available: false })];
    const { updates } = diffPriceList([current[0]], fetched);
    expect(updates).toContainEqual({ id: "1", costPrice: 19750n, status: "UNAVAILABLE" });
  });

  it("SKU yang tadinya UNAVAILABLE dan muncul lagi → kembali ACTIVE", () => {
    const cur: CurrentSku[] = [{ id: "9", providerSkuCode: "ML86", costPrice: 19750n, status: "UNAVAILABLE" }];
    const { updates } = diffPriceList(cur, [fetchedRow({})]);
    expect(updates).toContainEqual({ id: "9", costPrice: 19750n, status: "ACTIVE" });
  });

  it("tidak ada perubahan → tetap masuk updates dengan nilai sama (lastSyncedAt tetap maju)", () => {
    const { updates } = diffPriceList([current[1]], [fetchedRow({ skuCode: "FF100", costPrice: 14000n })]);
    expect(updates).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/price-sync.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// web/src/lib/catalog/price-sync.ts
import type { ProviderKey } from "@prisma/client";
import { db } from "@/lib/db";
import { getAdapter } from "@/lib/providers/registry";
import type { ProviderSkuPrice } from "@/lib/providers/types";

export interface CurrentSku {
  id: string;
  providerSkuCode: string;
  costPrice: bigint;
  status: "ACTIVE" | "UNAVAILABLE";
}

export interface SkuUpdate {
  id: string;
  costPrice: bigint;
  status: "ACTIVE" | "UNAVAILABLE";
}

// Pure: bandingkan SKU yang kita punya vs price list provider.
// SKU hilang dari price list atau available=false → UNAVAILABLE (spec §5.5).
// Sync tidak pernah MEMBUAT row — mapping dibuat admin.
export function diffPriceList(
  current: CurrentSku[],
  fetched: ProviderSkuPrice[],
): { updates: SkuUpdate[]; missingCount: number } {
  const byCode = new Map(fetched.map((f) => [f.skuCode, f]));
  const updates: SkuUpdate[] = [];
  let missingCount = 0;

  for (const sku of current) {
    const found = byCode.get(sku.providerSkuCode);
    if (!found) {
      missingCount++;
      updates.push({ id: sku.id, costPrice: sku.costPrice, status: "UNAVAILABLE" });
    } else {
      updates.push({
        id: sku.id,
        costPrice: found.costPrice,
        status: found.available ? "ACTIVE" : "UNAVAILABLE",
      });
    }
  }
  return { updates, missingCount };
}

// Orchestrator: dipanggil job handler (cron) dan tombol "Sync sekarang" admin.
// Idempotent — aman dijalankan dobel; setiap run tercatat di PriceSyncLog.
export async function runPriceSync(providerKey: ProviderKey): Promise<{ updated: number; missing: number }> {
  const log = await db.priceSyncLog.create({ data: { provider: providerKey } });
  try {
    const adapter = await getAdapter(providerKey);
    const fetched = await adapter.fetchPriceList();
    const current = await db.providerSku.findMany({
      where: { provider: providerKey },
      select: { id: true, providerSkuCode: true, costPrice: true, status: true },
    });

    const { updates, missingCount } = diffPriceList(current, fetched);
    const now = new Date();
    for (const u of updates) {
      await db.providerSku.update({
        where: { id: u.id },
        data: { costPrice: u.costPrice, status: u.status, lastSyncedAt: now },
      });
    }

    await db.priceSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), skusUpdated: updates.length, skusMissing: missingCount, result: "ok" },
    });
    return { updated: updates.length, missing: missingCount };
  } catch (e) {
    await db.priceSyncLog.update({
      where: { id: log.id },
      data: { finishedAt: new Date(), result: "error", error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/price-sync.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/catalog/price-sync.ts web/tests/price-sync.test.ts
git commit -m "feat(web): sync harga provider (diff pure + orchestrator PriceSyncLog)"
```

---

### Task 8: Job runner + cron tick endpoint

**Files:**
- Create: `web/src/lib/jobs/runner.ts`
- Create: `web/src/app/api/cron/tick/route.ts`
- Test: `web/tests/jobs-runner.test.ts`
- Modify: `web/.env.example` (tambah `CRON_SECRET`)

**Interfaces:**
- Consumes: `runPriceSync` (Task 7)
- Produces:

```ts
// runner.ts
export type JobHandler = (payload: unknown) => Promise<string | void>;
export const handlers: Record<string, JobHandler>; // { "sync-prices": ... } — Fase 3 tinggal menambah key baru
export function computeBackoff(attempts: number): number; // menit: 1, 5, 15, 60, 180 (index attempts-1, cap terakhir)
export async function runDueJobs(now?: Date): Promise<{ ran: number; failed: number }>;
// Klaim atomik: updateMany({where:{id, status:"PENDING"}, data:{status:"RUNNING"}}) — count 0 berarti
// job sudah diambil proses lain, skip. (Pelajaran audit Laravel: transisi status harus atomik.)
// Sukses → DONE. Gagal → attempts+1; attempts<maxAttempts → PENDING lagi dengan runAt=now+backoff; else FAILED.
// Handler "sync-prices" (payload {provider:"DIGIFLAZZ"}) → runPriceSync lalu re-enqueue dirinya +3 jam
// (self-rescheduling; spec §5.5 default 3 jam).
export async function ensureRecurringJobs(): Promise<void>;
// Untuk tiap ProviderConfig isActive=true: kalau belum ada Job PENDING/RUNNING type="sync-prices"
// dengan payload provider itu → create (runAt=now). Dipanggil setiap tick — idempotent.
```

Route `POST /api/cron/tick`: header `x-cron-secret` harus sama dengan `process.env.CRON_SECRET` (401 kalau tidak), lalu `ensureRecurringJobs()` + `runDueJobs()` dan balas `{ ran, failed }`.

- [ ] **Step 1: Write the failing test** (pure parts: backoff + keputusan status; klaim atomik ditest lewat fake db)

```ts
// web/tests/jobs-runner.test.ts
import { describe, expect, it } from "vitest";
import { computeBackoff, decideAfterFailure } from "@/lib/jobs/runner";

describe("computeBackoff", () => {
  it("eskalasi 1, 5, 15, 60, 180 menit lalu mentok di 180", () => {
    expect(computeBackoff(1)).toBe(1);
    expect(computeBackoff(2)).toBe(5);
    expect(computeBackoff(3)).toBe(15);
    expect(computeBackoff(4)).toBe(60);
    expect(computeBackoff(5)).toBe(180);
    expect(computeBackoff(99)).toBe(180);
  });
});

describe("decideAfterFailure", () => {
  it("attempts masih di bawah max → retry PENDING dengan runAt mundur sesuai backoff", () => {
    const now = new Date("2026-07-24T10:00:00Z");
    const d = decideAfterFailure({ attempts: 1, maxAttempts: 5 }, now);
    expect(d.status).toBe("PENDING");
    expect(d.runAt.getTime()).toBe(now.getTime() + 1 * 60_000);
  });

  it("attempts mencapai max → FAILED permanen", () => {
    const d = decideAfterFailure({ attempts: 5, maxAttempts: 5 }, new Date());
    expect(d.status).toBe("FAILED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/jobs-runner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// web/src/lib/jobs/runner.ts
import { db } from "@/lib/db";
import { runPriceSync } from "@/lib/catalog/price-sync";
import type { ProviderKey } from "@prisma/client";

export type JobHandler = (payload: unknown) => Promise<string | void>;

const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

// attempts = jumlah percobaan yang SUDAH gagal (1-based saat dipanggil)
export function computeBackoff(attempts: number): number {
  return BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
}

export function decideAfterFailure(
  job: { attempts: number; maxAttempts: number },
  now: Date,
): { status: "PENDING" | "FAILED"; runAt: Date } {
  if (job.attempts >= job.maxAttempts) return { status: "FAILED", runAt: now };
  return { status: "PENDING", runAt: new Date(now.getTime() + computeBackoff(job.attempts) * 60_000) };
}

export const handlers: Record<string, JobHandler> = {
  // payload: { provider: "DIGIFLAZZ" }
  "sync-prices": async (payload) => {
    const provider = (payload as { provider: ProviderKey }).provider;
    const result = await runPriceSync(provider);
    // Self-rescheduling: sync berikutnya 3 jam lagi (spec §5.5)
    await db.job.create({
      data: {
        type: "sync-prices",
        payload: { provider },
        runAt: new Date(Date.now() + 3 * 60 * 60_000),
      },
    });
    return `updated=${result.updated} missing=${result.missing}`;
  },
};

export async function ensureRecurringJobs(): Promise<void> {
  const active = await db.providerConfig.findMany({ where: { isActive: true }, select: { key: true } });
  for (const p of active) {
    const existing = await db.job.findFirst({
      where: {
        type: "sync-prices",
        status: { in: ["PENDING", "RUNNING"] },
        payload: { equals: { provider: p.key } },
      },
    });
    if (!existing) {
      await db.job.create({ data: { type: "sync-prices", payload: { provider: p.key }, runAt: new Date() } });
    }
  }
}

export async function runDueJobs(now: Date = new Date()): Promise<{ ran: number; failed: number }> {
  const due = await db.job.findMany({
    where: { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: 10, // batasi per tick supaya request cron tidak timeout
  });

  let ran = 0;
  let failed = 0;

  for (const job of due) {
    // Klaim atomik: hanya satu proses yang berhasil flip PENDING→RUNNING.
    const claimed = await db.job.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue; // sudah diambil tick lain

    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Handler untuk job type "${job.type}" tidak terdaftar.`);
      const result = await handler(job.payload);
      await db.job.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: null, ...(result ? { payload: job.payload as object } : {}) },
      });
      ran++;
    } catch (e) {
      const fresh = await db.job.findUniqueOrThrow({ where: { id: job.id }, select: { attempts: true, maxAttempts: true } });
      const decision = decideAfterFailure(fresh, new Date());
      await db.job.update({
        where: { id: job.id },
        data: {
          status: decision.status,
          runAt: decision.runAt,
          lastError: e instanceof Error ? e.message : String(e),
        },
      });
      failed++;
    }
  }
  return { ran, failed };
}
```

```ts
// web/src/app/api/cron/tick/route.ts
import { NextResponse } from "next/server";
import { ensureRecurringJobs, runDueJobs } from "@/lib/jobs/runner";

// Hostinger cron memanggil endpoint ini tiap menit (spec §10).
// Dilindungi secret header — bukan auth session, karena pemanggilnya mesin.
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureRecurringJobs();
  const result = await runDueJobs();
  return NextResponse.json(result);
}
```

Tambahkan ke `web/.env.example`:

```
CRON_SECRET="isi-string-acak-panjang"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run tests/jobs-runner.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Verifikasi kompilasi + commit**

Run: `cd web && npx tsc --noEmit` — Expected: tanpa error.

```bash
git add web/src/lib/jobs/runner.ts web/src/app/api/cron/tick/route.ts web/tests/jobs-runner.test.ts web/.env.example
git commit -m "feat(web): job runner MySQL queue + endpoint cron tick (secret header)"
```

---

### Task 9: Admin — halaman Providers (kredensial, saldo, sync)

> Implementer WAJIB pakai skill `ui-ux-pro-max` untuk halaman ini.

**Files:**
- Create: `web/src/app/admin/providers/page.tsx`
- Create: `web/src/app/actions/providers.ts`
- Test: `web/tests/validation-providers.test.ts`

**Interfaces:**
- Consumes: `encryptJson` (Task 1), `getAdapter` (Task 6), `runPriceSync` (Task 7), `auth` dari `@/lib/auth`, `db` dari `@/lib/db`
- Produces: server actions `saveDigiflazzCredentials(formData)`, `toggleProviderActive(formData)`, `checkProviderBalance(formData)`, `syncProviderNow(formData)`; Zod schema `digiflazzCredentialsSchema` di file actions (di-export untuk test).

Perilaku halaman `/admin/providers` (server component):
- List 4 `ProviderConfig` (seed Task 13 memastikan 4 row ada): nama, badge aktif/nonaktif, saldo terakhir (`balance`), `healthStatus`, waktu sync terakhir (ambil `PriceSyncLog` terbaru per provider).
- Form Digiflazz: input `username`, `apiKey`, `webhookSecret` (opsional) → action `saveDigiflazzCredentials`.
- Tombol per provider: "Aktifkan/Nonaktifkan", "Cek Saldo", "Sync Harga Sekarang" (hanya enabled kalau ada kredensial).
- SEMUA action: cek `session?.user?.role === "ADMIN"` (kalau bukan → return `{ error: "Tidak diizinkan" }`), tulis `AdminActionLog` (action mis. `"provider.save_credentials"`, `targetType: "provider"`, `targetId: key` — JANGAN log isi kredensial), lalu `revalidatePath("/admin/providers")`.

- [ ] **Step 1: Write the failing test** (validasi input — logic UI tidak di-unit-test)

```ts
// web/tests/validation-providers.test.ts
import { describe, expect, it } from "vitest";
import { digiflazzCredentialsSchema } from "@/app/actions/providers";

describe("digiflazzCredentialsSchema", () => {
  it("username + apiKey wajib, webhookSecret opsional", () => {
    expect(digiflazzCredentialsSchema.safeParse({ username: "u", apiKey: "k" }).success).toBe(true);
    expect(
      digiflazzCredentialsSchema.safeParse({ username: "u", apiKey: "k", webhookSecret: "s" }).success,
    ).toBe(true);
  });

  it("field kosong ditolak dengan pesan Indonesia", () => {
    const r = digiflazzCredentialsSchema.safeParse({ username: "", apiKey: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/wajib/i);
  });

  it("webhookSecret string kosong dinormalisasi jadi undefined", () => {
    const r = digiflazzCredentialsSchema.parse({ username: "u", apiKey: "k", webhookSecret: "" });
    expect(r.webhookSecret).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/validation-providers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// web/src/app/actions/providers.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { encryptJson } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers/registry";
import { runPriceSync } from "@/lib/catalog/price-sync";

export const digiflazzCredentialsSchema = z.object({
  username: z.string().min(1, "Username wajib diisi"),
  apiKey: z.string().min(1, "API key wajib diisi"),
  webhookSecret: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

type ActionResult = { ok?: string; error?: string };

async function requireAdmin(): Promise<{ adminId: string } | { error: string }> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) return { error: "Tidak diizinkan" };
  return { adminId: session.user.id };
}

async function logAdmin(adminId: string, action: string, targetId: string, detail?: object) {
  await db.adminActionLog.create({
    data: { adminId, action, targetType: "provider", targetId, detail },
  });
}

export async function saveDigiflazzCredentials(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = digiflazzCredentialsSchema.safeParse({
    username: formData.get("username"),
    apiKey: formData.get("apiKey"),
    webhookSecret: formData.get("webhookSecret") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.providerConfig.update({
    where: { key: "DIGIFLAZZ" },
    data: { credentials: encryptJson(parsed.data) },
  });
  await logAdmin(admin.adminId, "provider.save_credentials", "DIGIFLAZZ"); // isi kredensial TIDAK di-log
  revalidatePath("/admin/providers");
  return { ok: "Kredensial Digiflazz tersimpan." };
}

export async function toggleProviderActive(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  const config = await db.providerConfig.findUnique({ where: { key } });
  if (!config) return { error: "Provider tidak ditemukan." };
  if (!config.isActive && !config.credentials) return { error: "Isi kredensial dulu sebelum mengaktifkan." };

  await db.providerConfig.update({ where: { key }, data: { isActive: !config.isActive } });
  await logAdmin(admin.adminId, config.isActive ? "provider.deactivate" : "provider.activate", key);
  revalidatePath("/admin/providers");
  return { ok: `Provider ${key} ${config.isActive ? "dinonaktifkan" : "diaktifkan"}.` };
}

export async function checkProviderBalance(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  try {
    const adapter = await getAdapter(key);
    const balance = await adapter.fetchBalance();
    const config = await db.providerConfig.update({
      where: { key },
      data: { balance, healthStatus: "HEALTHY", lastHealthCheckAt: new Date() },
    });
    await db.providerBalanceLog.create({ data: { providerId: config.id, balance } });
    await logAdmin(admin.adminId, "provider.check_balance", key, { balance: balance.toString() });
    revalidatePath("/admin/providers");
    return { ok: `Saldo ${key}: Rp ${Number(balance).toLocaleString("id-ID")}` };
  } catch (e) {
    await db.providerConfig.update({
      where: { key },
      data: { healthStatus: "DOWN", lastHealthCheckAt: new Date() },
    });
    return { error: e instanceof Error ? e.message : "Gagal cek saldo." };
  }
}

export async function syncProviderNow(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const key = formData.get("key") as ProviderKey;
  try {
    const result = await runPriceSync(key);
    await logAdmin(admin.adminId, "provider.sync_prices", key, result);
    revalidatePath("/admin/providers");
    return { ok: `Sync ${key}: ${result.updated} SKU diupdate, ${result.missing} hilang.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync gagal." };
  }
}
```

Halaman `web/src/app/admin/providers/page.tsx`: server component; ambil `db.providerConfig.findMany({ orderBy: { priority: "asc" } })` + `db.priceSyncLog.findFirst({ where: { provider: key }, orderBy: { startedAt: "desc" } })` per provider; render card per provider (pakai komponen `Card`, `Button`, `Input`, `Label` dari `@/components/ui/`) + form Digiflazz + tombol-tombol `<form action={...}>`. Detail visual: serahkan ke skill `ui-ux-pro-max` — konsisten dengan admin shell existing (`web/src/app/admin/layout.tsx`).

- [ ] **Step 4: Run tests + typecheck**

Run: `cd web && npx vitest run tests/validation-providers.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests), tsc bersih

- [ ] **Step 5: Verifikasi manual singkat**

Run: `cd web && npm run dev`, buka `http://localhost:3000/admin/providers` sebagai admin (`admin@dannshop.test`).
Expected: 4 provider tampil; simpan kredensial Digiflazz → sukses; row `AdminActionLog` bertambah (cek via `npx prisma studio`).

- [ ] **Step 6: Commit**

```bash
git add web/src/app/admin/providers/page.tsx web/src/app/actions/providers.ts web/tests/validation-providers.test.ts
git commit -m "feat(web): admin providers (kredensial terenkripsi, cek saldo, sync manual)"
```

---

### Task 10: Admin — CRUD Produk & ProductItem

> Implementer WAJIB pakai skill `ui-ux-pro-max` untuk halaman ini.

**Files:**
- Create: `web/src/app/admin/products/page.tsx` (list)
- Create: `web/src/app/admin/products/new/page.tsx` (form create)
- Create: `web/src/app/admin/products/[id]/page.tsx` (edit produk + kelola items)
- Create: `web/src/app/actions/catalog.ts`
- Test: `web/tests/validation-catalog.test.ts`

**Interfaces:**
- Consumes: `auth`, `db`, pola `requireAdmin`/`logAdmin` (duplikasi lokal di `catalog.ts` boleh — jangan import dari `providers.ts` karena file "use server" hanya boleh export async function)
- Produces: server actions `createProduct`, `updateProduct`, `createProductItem`, `updateProductItem`, `toggleProductActive`; Zod schemas `productSchema`, `productItemSchema` (di-export via file terpisah `web/src/lib/validation/catalog.ts` supaya bisa dipakai test & action).

```ts
// web/src/lib/validation/catalog.ts
export const productSchema = z.object({
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  slug: z.string().min(1, "Slug wajib diisi").regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, tanda hubung"),
  name: z.string().min(1, "Nama wajib diisi"),
  publisher: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  description: z.string().optional().transform((v) => (v === "" ? undefined : v)),
  // inputFields dikirim sebagai JSON string dari textarea admin
  inputFields: z.string().transform((v, ctx) => {
    try {
      const parsed = JSON.parse(v);
      if (!Array.isArray(parsed)) throw new Error();
      return parsed as { name: string; label: string }[];
    } catch {
      ctx.addIssue({ code: "custom", message: "inputFields harus JSON array, contoh: [{\"name\":\"user_id\",\"label\":\"User ID\"}]" });
      return z.NEVER;
    }
  }),
  nicknameCheckKey: z.string().optional().transform((v) => (v === "" ? undefined : v)),
});

export const productItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1, "Nama item wajib diisi"),
  sellingPrice: z.coerce.bigint().positive("Harga jual harus > 0"),
  memberPrice: z.coerce.bigint().positive("Harga member harus > 0"),
  sortOrder: z.coerce.number().int().default(0),
});
```

- [ ] **Step 1: Write the failing test**

```ts
// web/tests/validation-catalog.test.ts
import { describe, expect, it } from "vitest";
import { productSchema, productItemSchema } from "@/lib/validation/catalog";

describe("productSchema", () => {
  const valid = {
    categoryId: "cat1", slug: "mobile-legends", name: "Mobile Legends",
    publisher: "Moonton", description: "",
    inputFields: '[{"name":"user_id","label":"User ID"},{"name":"zone_id","label":"Zone ID"}]',
    nicknameCheckKey: "",
  };

  it("input valid diterima, inputFields ter-parse jadi array", () => {
    const r = productSchema.parse(valid);
    expect(r.inputFields).toHaveLength(2);
    expect(r.description).toBeUndefined();
  });

  it("slug dengan huruf besar/spasi ditolak", () => {
    expect(productSchema.safeParse({ ...valid, slug: "Mobile Legends" }).success).toBe(false);
  });

  it("inputFields bukan JSON array → error dengan pesan contoh", () => {
    const r = productSchema.safeParse({ ...valid, inputFields: "{}" });
    expect(r.success).toBe(false);
  });
});

describe("productItemSchema", () => {
  it("harga dari string form di-coerce ke bigint", () => {
    const r = productItemSchema.parse({
      productId: "p1", name: "86 Diamonds", sellingPrice: "22000", memberPrice: "21500", sortOrder: "1",
    });
    expect(r.sellingPrice).toBe(22000n);
    expect(r.memberPrice).toBe(21500n);
  });

  it("harga 0 / negatif ditolak", () => {
    expect(
      productItemSchema.safeParse({ productId: "p1", name: "x", sellingPrice: "0", memberPrice: "1" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/validation-catalog.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

1. Buat `web/src/lib/validation/catalog.ts` persis seperti blok Interfaces di atas (plus `import { z } from "zod";`).
2. Buat `web/src/app/actions/catalog.ts` — pola sama dengan `providers.ts` (requireAdmin → parse Zod → mutasi db → `AdminActionLog` action `"catalog.create_product"` dll → `revalidatePath("/admin/products")` → return `{ok}/{error}`):
   - `createProduct(formData)` → `db.product.create` (`isActive: false` default; aktifkan eksplisit)
   - `updateProduct(formData)` → by `id` (hidden input)
   - `toggleProductActive(formData)`
   - `createProductItem(formData)` / `updateProductItem(formData)` (field `isActive` checkbox → `formData.get("isActive") === "on"`)
3. Halaman:
   - `/admin/products` — tabel: nama, kategori, jumlah item, status aktif, link edit. Tombol "+ Produk baru".
   - `/admin/products/new` — form productSchema, dropdown kategori dari `db.category.findMany({ orderBy: { sortOrder: "asc" } })`.
   - `/admin/products/[id]` — form edit + daftar `ProductItem` (inline form tambah/edit item; tampilkan harga pakai `Number(x).toLocaleString("id-ID")`).

- [ ] **Step 4: Run tests + typecheck**

Run: `cd web && npx vitest run tests/validation-catalog.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests), tsc bersih

- [ ] **Step 5: Verifikasi manual**

`npm run dev` → `/admin/products` → buat produk "Mobile Legends" (kategori Games, inputFields user_id+zone_id) → tambah item "86 Diamonds" harga 22000/21500 → keduanya muncul di list & tersimpan di DB.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/admin/products web/src/app/actions/catalog.ts web/src/lib/validation/catalog.ts web/tests/validation-catalog.test.ts
git commit -m "feat(web): admin CRUD produk & item (validasi zod, harga bigint)"
```

---

### Task 11: Admin — mapping ProviderSku + margin viewer

> Implementer WAJIB pakai skill `ui-ux-pro-max` untuk halaman ini.

**Files:**
- Modify: `web/src/app/admin/products/[id]/page.tsx` (tambah seksi mapping per item)
- Modify: `web/src/app/actions/catalog.ts` (tambah actions mapping)
- Create: `web/src/app/admin/products/[id]/sku-picker.tsx` (client component pencarian SKU)
- Create: `web/src/app/api/admin/provider-price-list/route.ts` (sumber data picker)

**Interfaces:**
- Consumes: `getAdapter` (Task 6), `productItemSchema` pattern (Task 10)
- Produces: actions `mapProviderSku(formData)` (fields: `productItemId`, `provider`, `providerSkuCode`, `costPrice`) → `db.providerSku.upsert` on `@@unique([productItemId, provider])`; `unmapProviderSku(formData)` (field `id`) → delete. Route `GET /api/admin/provider-price-list?provider=DIGIFLAZZ&q=diamond` → role ADMIN wajib (cek `auth()`, 403 kalau bukan) → `adapter.fetchPriceList()` difilter `q` (max 50 row) → JSON `{ rows: [{ skuCode, productName, brand, costPrice: string, available }] }` (costPrice di-string-kan — BigInt tidak bisa di-JSON.stringify).

Perilaku UI di `/admin/products/[id]`, per `ProductItem`:
- Tampilkan mapping existing per provider: kode SKU, `costPrice`, status, `lastSyncedAt`, **margin** = `sellingPrice − costPrice` (hijau kalau positif, merah kalau negatif — margin negatif = jual rugi, WAJIB kelihatan mencolok).
- `sku-picker.tsx` (client): pilih provider → ketik kata kunci → fetch route di atas → klik row → isi hidden form `mapProviderSku` → submit.

- [ ] **Step 1: Implementasi actions + route** (logic tipis di atas primitives yang sudah di-test; tidak ada unit test baru — validasi manual di Step 3)

Actions mengikuti pola `requireAdmin` + `AdminActionLog` (`"catalog.map_sku"`, `"catalog.unmap_sku"`) + `revalidatePath`. Route:

```ts
// web/src/app/api/admin/provider-price-list/route.ts
import { NextResponse } from "next/server";
import type { ProviderKey } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getAdapter } from "@/lib/providers/registry";

export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") as ProviderKey | null;
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  if (!provider) return NextResponse.json({ error: "provider wajib" }, { status: 400 });

  try {
    const adapter = await getAdapter(provider);
    const rows = (await adapter.fetchPriceList())
      .filter((r) => !q || r.productName.toLowerCase().includes(q) || r.brand.toLowerCase().includes(q) || r.skuCode.toLowerCase().includes(q))
      .slice(0, 50)
      .map((r) => ({ ...r, costPrice: r.costPrice.toString() }));
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal ambil price list" }, { status: 502 });
  }
}
```

- [ ] **Step 2: Typecheck + test regresi**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: bersih, semua test PASS

- [ ] **Step 3: Verifikasi manual**

`npm run dev` → `/admin/products/[id]` item "86 Diamonds" → picker Digiflazz cari "mobile legends" → pilih SKU → mapping tersimpan, margin tampil benar (selling 22000 − cost dari price list). Klik "Sync Harga Sekarang" di `/admin/providers` → `costPrice` & `lastSyncedAt` berubah.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/admin/products web/src/app/actions/catalog.ts web/src/app/api/admin/provider-price-list
git commit -m "feat(web): mapping SKU provider per item + margin viewer"
```

---

### Task 12: Admin — transaksi tes Digiflazz (DoD enabler)

> Implementer WAJIB pakai skill `ui-ux-pro-max` untuk halaman ini.

**Files:**
- Create: `web/src/app/admin/providers/test-transaction/page.tsx`
- Modify: `web/src/app/actions/providers.ts` (tambah action `sendTestTransaction`)
- Test: `web/tests/validation-providers.test.ts` (tambah describe)

**Interfaces:**
- Consumes: `getAdapter` (Task 6), `CreateTrxInput` (Task 2)
- Produces: action `sendTestTransaction(formData)` fields: `skuCode`, `target`, `testing` (checkbox, default ON). `refId` digenerate `TEST-<yyyymmdd>-<6 char acak>`; hasil (`status`, `sn`, `message`) dikembalikan untuk dirender; dicatat ke `AdminActionLog` action `"provider.test_transaction"` dengan detail `{ refId, skuCode, status }`.

Schema (export dari `providers.ts`):

```ts
export const testTransactionSchema = z.object({
  skuCode: z.string().min(1, "Kode SKU wajib diisi"),
  target: z.string().min(1, "Nomor tujuan wajib diisi"),
  testing: z.coerce.boolean().default(true),
});
```

- [ ] **Step 1: Write the failing test** (tambah di `web/tests/validation-providers.test.ts`)

```ts
import { testTransactionSchema } from "@/app/actions/providers";

describe("testTransactionSchema", () => {
  it("skuCode + target wajib; testing default true", () => {
    const r = testTransactionSchema.parse({ skuCode: "ML86", target: "123456789" });
    expect(r.testing).toBe(true);
  });

  it("field kosong ditolak", () => {
    expect(testTransactionSchema.safeParse({ skuCode: "", target: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run tests/validation-providers.test.ts`
Expected: FAIL — `testTransactionSchema` belum di-export

- [ ] **Step 3: Write implementation**

Action di `providers.ts`:

```ts
export async function sendTestTransaction(formData: FormData): Promise<
  ActionResult & { result?: { refId: string; status: string; sn: string | null; message: string } }
> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  const parsed = testTransactionSchema.safeParse({
    skuCode: formData.get("skuCode"),
    target: formData.get("target"),
    testing: formData.get("testing") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const refId = `TEST-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  try {
    const adapter = await getAdapter("DIGIFLAZZ");
    const result = await adapter.createTransaction({ ...parsed.data, refId });
    await logAdmin(admin.adminId, "provider.test_transaction", "DIGIFLAZZ", {
      refId, skuCode: parsed.data.skuCode, status: result.status,
    });
    return { ok: `Transaksi tes terkirim (${result.status}).`, result: { refId, status: result.status, sn: result.sn, message: result.message } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Transaksi tes gagal." };
  }
}
```

Halaman `test-transaction/page.tsx`: form (SKU code — bisa diisi dari mapping yang ada, target, checkbox "mode testing"), render hasil (status/SN/message) + peringatan jelas: *"Matikan mode testing = transaksi NYATA memotong saldo Digiflazz."*

- [ ] **Step 4: Run tests + typecheck**

Run: `cd web && npx vitest run && npx tsc --noEmit`
Expected: semua PASS, tsc bersih

- [ ] **Step 5: Commit**

```bash
git add web/src/app/admin/providers/test-transaction web/src/app/actions/providers.ts web/tests/validation-providers.test.ts
git commit -m "feat(web): halaman transaksi tes Digiflazz dari admin"
```

---

### Task 13: Seed — 4 ProviderConfig + contoh katalog

**Files:**
- Modify: `web/prisma/seed.ts`

**Interfaces:**
- Consumes: pola upsert existing di seed.ts
- Produces: 4 row `ProviderConfig` (DIGIFLAZZ prio 10, SERPUL 20, OKECONNECT 30, QIOSPAY 40 — semua `isActive: false`, `credentials: null`); 2 produk contoh nonaktif: `mobile-legends` (kategori `games`, inputFields user_id+zone_id, item "86 Diamonds" 22000/21500) dan `free-fire` (inputFields user_id, item "100 Diamond" 16000/15500). Idempotent (upsert by slug; item: findFirst by productId+name → create kalau belum ada).

- [ ] **Step 1: Tambahkan ke `main()` di seed.ts**

```ts
const PROVIDERS = [
  { key: "DIGIFLAZZ" as const, displayName: "Digiflazz", priority: 10 },
  { key: "SERPUL" as const, displayName: "Serpul", priority: 20 },
  { key: "OKECONNECT" as const, displayName: "OkeConnect", priority: 30 },
  { key: "QIOSPAY" as const, displayName: "QiosPay", priority: 40 },
];

for (const p of PROVIDERS) {
  await db.providerConfig.upsert({
    where: { key: p.key },
    update: { displayName: p.displayName, priority: p.priority },
    create: p, // isActive false, credentials null — diisi lewat admin
  });
}

const games = await db.category.findUniqueOrThrow({ where: { slug: "games" } });
const SAMPLE_PRODUCTS = [
  {
    slug: "mobile-legends", name: "Mobile Legends", publisher: "Moonton",
    inputFields: [{ name: "user_id", label: "User ID" }, { name: "zone_id", label: "Zone ID" }],
    items: [{ name: "86 Diamonds", sellingPrice: 22000n, memberPrice: 21500n, sortOrder: 1 }],
  },
  {
    slug: "free-fire", name: "Free Fire", publisher: "Garena",
    inputFields: [{ name: "user_id", label: "User ID" }],
    items: [{ name: "100 Diamond", sellingPrice: 16000n, memberPrice: 15500n, sortOrder: 1 }],
  },
];

for (const sp of SAMPLE_PRODUCTS) {
  const product = await db.product.upsert({
    where: { slug: sp.slug },
    update: { name: sp.name, publisher: sp.publisher },
    create: {
      categoryId: games.id, slug: sp.slug, name: sp.name, publisher: sp.publisher,
      inputFields: sp.inputFields, isActive: false, // aktifkan manual setelah mapping SKU
    },
  });
  for (const item of sp.items) {
    const existing = await db.productItem.findFirst({ where: { productId: product.id, name: item.name } });
    if (!existing) await db.productItem.create({ data: { productId: product.id, ...item } });
  }
}
```

Update baris `console.log` akhir agar menyebut jumlah provider + produk contoh.

- [ ] **Step 2: Jalankan seed 2x untuk membuktikan idempotent**

Run: `cd web && npx prisma db seed && npx prisma db seed`
Expected: dua-duanya sukses tanpa error duplicate; row tidak dobel (cek `npx prisma studio`: 4 ProviderConfig, 2 produk, 2 item).

- [ ] **Step 3: Commit**

```bash
git add web/prisma/seed.ts
git commit -m "feat(web): seed 4 provider config + contoh katalog ML & FF (idempotent)"
```

---

### Task 14: Verifikasi akhir fase + update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md` (root repo)

- [ ] **Step 1: Jalankan seluruh verifikasi**

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run lint && npm run build
```

Expected: semua PASS/bersih. Kalau ada yang gagal → perbaiki dulu (pakai skill systematic-debugging), JANGAN lanjut.

- [ ] **Step 2: Uji DoD end-to-end manual (dengan kredensial Digiflazz asli Wildan)**

1. `/admin/providers` → isi kredensial Digiflazz → "Cek Saldo" → saldo tampil.
2. "Sync Harga Sekarang" → `PriceSyncLog` result `ok`; mapping SKU di item ML ter-update harga modalnya.
3. `/admin/providers/test-transaction` → kirim transaksi `testing=true` → status tampil (pending/success).
4. `POST /api/cron/tick` dengan header `x-cron-secret` benar → `{ran, failed}`; tanpa header → 401.

Expected DoD spec §12 fase 2 terpenuhi: *"Price list Digiflazz masuk DB, transaksi manual dari admin sukses."*

- [ ] **Step 3: Update PROGRESS.md** — tabel status Fase 2 (task 1–14 + commit hash), catatan penting sesi, dan "langkah pertama saat lanjut" menunjuk Fase 3.

- [ ] **Step 4: Commit + push**

```bash
git add PROGRESS.md
git commit -m "docs: checkpoint fase 2 selesai (katalog + Digiflazz)"
git push -u origin fase-2-katalog
```

Lalu buat PR `fase-2-katalog` → `main` manual via web GitHub (gh CLI tidak terinstall): `https://github.com/DannShop/DANNSHOP-E-COMMERCE/pull/new/fase-2-katalog`

---

## Self-Review Checklist (sudah dijalankan saat menulis plan)

- **Spec coverage Fase 2**: adapter interface §5.1 (Task 2), Digiflazz §5.2 penuh (Task 3–5), enkripsi kredensial §11 (Task 1), sync harga §5.5 (Task 7), job queue + cron §10 (Task 8), admin providers/produk/mapping/margin §9 poin 7–8 (Task 9–11), transaksi manual admin = DoD §12 (Task 12), seed (Task 13). Routing termurah §5.5 = Fase 6 (bukan fase ini). Webhook route Digiflazz = Fase 3 (dipakai order flow; parseCallback-nya sudah siap dari Task 5).
- **Deviasi tercatat**: `checkStatus(input)` menerima input penuh, bukan `refId` saja (kebutuhan idempotency Digiflazz) — dicatat di Task 2.
- **Type consistency**: `ProviderSkuPrice.costPrice: bigint` konsisten Task 2→3→7→11; `CreateTrxInput` konsisten Task 2→4→12; `ActionResult` konsisten Task 9→12.
