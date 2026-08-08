import type { ProviderApiLog } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { diagnoseFailure } from "@/lib/order/failure-reason";
import type { ProviderApiOutcome } from "@/lib/providers/api-log";

// Tampilan satu baris riwayat panggilan API provider. Dipakai BERSAMA oleh halaman
// detail order (riwayat panggilan untuk order itu saja) dan halaman /admin/provider-logs
// (semua panggilan) - dua tempat itu harus menampilkan hal yang sama persis, kalau
// tidak admin akan menyimpulkan berbeda tergantung dari mana dia membukanya.

const OUTCOME_LABEL: Record<string, string> = {
  SUCCESS: "Berhasil",
  PENDING: "Menunggu",
  REJECTED: "Ditolak provider",
  INVALID_RESPONSE: "Respons tidak terbaca",
  TRANSPORT_ERROR: "Tidak sampai ke provider",
};

const OUTCOME_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  SUCCESS: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  INVALID_RESPONSE: "destructive",
  TRANSPORT_ERROR: "destructive",
};

const OPERATION_LABEL: Record<string, string> = {
  transaction: "Kirim transaksi",
  "check-status": "Cek status",
  "price-list": "Sync harga",
  "cek-saldo": "Cek saldo",
};

// Penjelasan untuk kegagalan yang terjadi SEBELUM provider sempat menjawab -
// diagnoseFailure tidak bisa membantu di sini karena tidak ada pesan provider
// untuk dicocokkan polanya, padahal justru kasus inilah yang paling
// membingungkan (order gagal, log provider kosong melompong).
const TRANSPORT_HINT: Record<string, string> = {
  TRANSPORT_ERROR:
    "Request tidak pernah mendapat balasan — timeout 15 detik, DNS, atau koneksi ditolak. " +
    "Kalau berulang di banyak order, masalahnya di jaringan/keluar-IP server, bukan di data order ini.",
  INVALID_RESPONSE:
    "Provider membalas sesuatu yang bukan JSON (sering kali halaman error HTML dari WAF/proxy di depan API mereka). " +
    "Lihat isi respons mentah di bawah — sebab aslinya biasanya tertulis di situ.",
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-muted-foreground select-none">{label}</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function ProviderApiLogEntryCard({ log, showOrder = false }: { log: ProviderApiLog; showOrder?: boolean }) {
  const outcome = log.outcome as ProviderApiOutcome;
  // Diagnosis pesan provider hanya masuk akal kalau providernya MENJAWAB dan menolak.
  const diagnosis = outcome === "REJECTED" ? diagnoseFailure(log.message) : null;
  const transportHint = TRANSPORT_HINT[outcome];

  return (
    <li className="rounded border p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={OUTCOME_VARIANT[outcome] ?? "muted"}>{OUTCOME_LABEL[outcome] ?? outcome}</Badge>
        <span className="font-medium">{OPERATION_LABEL[log.operation] ?? log.operation}</span>
        <span className="text-xs text-muted-foreground">
          {log.provider} · HTTP {log.httpStatus ?? "-"} · {log.durationMs} ms · {formatDateTime(log.createdAt)}
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground break-all">
        {log.endpoint}
        {" · "}
        {/* Jalur keluar wajib terlihat: rc 45 lewat relay artinya IP RELAY yang
            belum di-whitelist, sedangkan rc 45 langsung artinya env relay belum
            terpasang di deployment ini. Dua perbaikan yang sama sekali berbeda. */}
        {/* text-warning-foreground, bukan text-warning: --warning itu warna LATAR
            (kuning pucat #FEF3C7) yang praktis tak terbaca sebagai teks. */}
        <span className={log.viaRelay ? "" : "font-medium text-warning-foreground"}>
          {log.viaRelay ? "via relay" : "langsung"}
        </span>
        {log.providerRc && <> · rc: <span className="font-mono">{log.providerRc}</span></>}
        {log.ourRefId && <> · ref: <span className="font-mono">{log.ourRefId}</span></>}
        {showOrder && log.orderNumber && <> · order: <span className="font-mono">{log.orderNumber}</span></>}
      </p>

      {log.message && <p className="mt-1 text-xs">{log.message}</p>}
      {log.errorMessage && <p className="mt-1 text-xs text-destructive break-all">{log.errorMessage}</p>}

      {diagnosis && (
        <div className="mt-1.5 rounded bg-destructive/10 px-2 py-1.5 text-xs">
          <p className="font-medium text-destructive">{diagnosis.label}</p>
          {diagnosis.action && <p className="mt-0.5 text-muted-foreground">{diagnosis.action}</p>}
          {/* Kalau SUDAH lewat relay tapi tetap rc 45, saran umum di atas menyesatkan:
              relay-nya sudah jalan, yang kurang tinggal mendaftarkan IP-nya. IP yang
              disebut provider di pesan itu adalah IP relay — itulah yang di-whitelist. */}
          {diagnosis.category === "ip_not_whitelisted" && log.viaRelay && (
            <p className="mt-1 font-medium text-foreground">
              Relay sudah aktif — jadi IP di pesan ini adalah IP relay kamu. Daftarkan IP itu di Digiflazz (Atur Akun →
              IP Whitelist). Setelah terdaftar, alamatnya tidak akan berubah lagi.
            </p>
          )}
        </div>
      )}
      {transportHint && (
        <div className="mt-1.5 rounded bg-destructive/10 px-2 py-1.5 text-xs text-muted-foreground">{transportHint}</div>
      )}

      <JsonBlock label="Request yang dikirim (kredensial diredaksi)" value={log.requestBody} />
      {log.responseBody !== null && <JsonBlock label="Respons provider (mentah)" value={log.responseBody} />}
      {log.responseText && <JsonBlock label="Respons mentah (bukan JSON)" value={log.responseText} />}
    </li>
  );
}
