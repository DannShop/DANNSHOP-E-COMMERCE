import { sendTestTransaction, checkTestTransactionStatus } from "@/app/actions/providers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TestTransactionForm } from "./test-transaction-form";

export default function TestTransactionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Transaksi Tes Digiflazz</h1>
        <p className="text-sm text-muted-foreground">
          Kirim transaksi langsung ke Digiflazz untuk memverifikasi kredensial &amp; alur transaksi tanpa lewat order pelanggan.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Kirim transaksi tes</CardTitle>
          <CardDescription>
            Ref ID dibuat otomatis (<span className="font-mono">TEST-yyyymmdd-XXXXXX</span>) supaya tidak bentrok dengan transaksi asli.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestTransactionForm
            sendTestTransaction={sendTestTransaction}
            checkTestTransactionStatus={checkTestTransactionStatus}
          />
        </CardContent>
      </Card>
    </div>
  );
}
