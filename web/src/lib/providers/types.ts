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

// Identitas order yang MEMICU panggilan ini — dipakai semata-mata untuk mengaitkan
// baris ProviderApiLog ke order, supaya halaman detail order bisa menampilkan
// riwayat panggilan API-nya sendiri. Semuanya opsional: panggilan yang tidak
// terikat order (sync price-list, cek saldo) tetap dicatat, hanya tanpa kaitan.
export interface ProviderCallContext {
  orderId?: string;
  orderNumber?: string;
  fulfillmentId?: string;
  ourRefId?: string;
}

export interface CreateTrxInput {
  skuCode: string;
  target: string;   // customer_no gabungan (mis. userid+zoneid) — pembentukan format = urusan pemanggil
  refId: string;    // our_ref_id, unik per attempt, kunci idempotency
  testing?: boolean; // mode tes Digiflazz (transaksi simulasi)
  context?: ProviderCallContext;
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
