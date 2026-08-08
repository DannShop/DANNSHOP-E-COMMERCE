import { getMidtransConfigStatus } from "@/lib/payment/gateway-config";
import { getPaymentRules } from "@/lib/payment/rules";
import {
  saveMidtransCredentials,
  savePaymentRulesAction,
  testMidtransConnection,
  testPaymentChannels,
} from "@/app/actions/payment-config";
import { MidtransConfigForm } from "./midtrans-config-form";
import { PaymentRulesForm } from "./payment-rules-form";

export const dynamic = "force-dynamic";

export default async function PaymentConfigPage() {
  const [status, rules] = await Promise.all([getMidtransConfigStatus(), getPaymentRules()]);

  // NEXT_PUBLIC_APP_URL dipakai supaya URL yang ditampilkan sama dengan domain
  // yang benar-benar dipakai deployment ini — kalau kosong, admin masih bisa
  // melihat bentuk path-nya dan melengkapi domainnya sendiri.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const webhookUrl = `${appUrl}/api/webhooks/midtrans`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Konfigurasi Payment</h1>
        <p className="text-sm text-muted-foreground">
          Kredensial payment gateway, mode sandbox/production, dan aturan kode unik & biaya admin. Batas waktu bayar
          per metode diatur di halaman Metode Pembayaran.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Midtrans</h2>
        <MidtransConfigForm
          status={status}
          webhookUrl={webhookUrl}
          action={saveMidtransCredentials}
          testAction={testMidtransConnection}
          channelTestAction={testPaymentChannels}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Kode Unik & Biaya Admin</h2>
        <PaymentRulesForm rules={rules} action={savePaymentRulesAction} />
      </section>
    </div>
  );
}
