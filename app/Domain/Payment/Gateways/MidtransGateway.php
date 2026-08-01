<?php

namespace App\Domain\Payment\Gateways;

use App\Contracts\PaymentGatewayInterface;
use App\Domain\Payment\DTOs\PaymentRequestData;
use App\Domain\Payment\DTOs\PaymentResponseData;
use App\Domain\Payment\DTOs\PaymentStatusData;
use App\Domain\Payment\DTOs\WebhookPayloadData;
use App\Domain\Payment\Models\PaymentProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Architecture v1 §8.1. Implements PaymentGatewayInterface for Midtrans
 * — built from VERIFIED official documentation (docs.midtrans.com),
 * confirmed during this session's research, not guessed. This is the
 * PRIORITY gateway per Wildan's decision: he already has a registered
 * Midtrans account, and Midtrans is a licensed PJP (Payment Services
 * Provider), resolving the Bank Indonesia regulatory concern flagged in
 * Database Architecture v2 §8.5 that applied to the old OkeConnect/
 * OrderKuota providers.
 *
 * CONFIRMED VIA RESEARCH (this session):
 * - Midtrans QRIS is DYNAMIC — a real per-transaction QR is generated
 *   via the Core API charge endpoint, unlike the old static-QRIS
 *   providers. supportsDynamicQris() therefore returns true, meaning
 *   PaymentService's static-QRIS uniqueness-offset strategy
 *   (Architecture v1 §8.3) does NOT apply when Midtrans is active —
 *   the order's gross_amount is the payable amount directly, no offset
 *   needed, because the QR itself uniquely identifies the transaction.
 * - Webhook ("HTTP Notification") is real and is the primary
 *   confirmation mechanism, verified via a signature_key field.
 * - Midtrans may send MULTIPLE notifications for a single Order ID
 *   (e.g. failed card attempts before a final successful GoPay/QRIS
 *   payment) — this is normal, documented behavior, not a bug. The
 *   webhook handler in PaymentService must NOT treat an early
 *   "deny"/"failure" notification as final; only a "settlement" or
 *   "capture" with fraud_status="accept" should trigger
 *   OrderService::confirmPayment().
 * - Idempotency-Key header is natively supported by Midtrans for the
 *   charge request itself (protects against double-charging on network
 *   retry) — separate from, and in addition to, our own
 *   payment_transactions unique-constraint idempotency guarantee on the
 *   webhook side (Database Architecture v2 §9.2).
 *
 * Official PHP SDK exists (midtrans/midtrans-php via Composer) — this
 * implementation uses direct HTTP calls instead, to keep behavior
 * fully explicit and consistent with how the other gateway
 * implementations are structured (no hidden SDK behavior to account
 * for when reasoning about idempotency/signature verification).
 * Switching to the official SDK later is a reasonable optional
 * refactor, not a requirement.
 */
class MidtransGateway implements PaymentGatewayInterface
{
    private const SANDBOX_BASE_URL = 'https://api.sandbox.midtrans.com/v2';
    private const PRODUCTION_BASE_URL = 'https://api.midtrans.com/v2';

    public function __construct(
        private PaymentProvider $provider,
    ) {
    }

    /**
     * Confirmed request/response shape from docs.midtrans.com/reference/qris:
     * POST /v2/charge with payment_type="qris", transaction_details,
     * item_details, customer_details. Response includes an `actions`
     * array with a `generate-qr-code` URL to fetch the actual QR image.
     */
    public function createPayment(PaymentRequestData $request): PaymentResponseData
    {
        $credentials = $this->credentials();

        $response = Http::withBasicAuth($credentials['server_key'], '')
            ->withHeaders(['Idempotency-Key' => $request->orderNumber]) // confirmed-supported native idempotency protection
            ->post($this->baseUrl().'/charge', [
                'payment_type' => 'qris',
                'transaction_details' => [
                    'order_id' => $request->orderNumber,
                    'gross_amount' => $request->amount,
                ],
                'customer_details' => [
                    'email' => $request->buyerEmail,
                    'phone' => $request->buyerPhone,
                ],
                'qris' => [
                    'acquirer' => 'gopay', // confirmed default acquirer in Midtrans QRIS docs example
                ],
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Midtrans payment creation failed: '.$response->body());
        }

        $body = $response->json();

        // Confirmed shape: actions[] contains a 'generate-qr-code' entry
        // with the URL to fetch the QR image — we store that URL as the
        // qrisPayload; the frontend hotlinks it directly as an <img> src,
        // per Midtrans's own documented integration pattern.
        $qrAction = collect($body['actions'] ?? [])->firstWhere('name', 'generate-qr-code');

        return new PaymentResponseData(
            providerReference: $body['transaction_id'],
            isDynamicQris: true, // confirmed — real per-transaction QR
            qrisPayload: $qrAction['url'] ?? null,
        );
    }

    /**
     * Confirmed via docs.midtrans.com: Core API Get Status endpoint.
     * Note from research: a transaction created via Snap may return 404
     * "Payment Not Found" on this endpoint if the customer hasn't yet
     * chosen a payment method — PaymentService's reconciliation job
     * must treat a 404 here as 'pending', not as an error condition.
     */
    public function checkStatus(string $providerReference): PaymentStatusData
    {
        $credentials = $this->credentials();

        $response = Http::withBasicAuth($credentials['server_key'], '')
            ->get($this->baseUrl().'/'.$providerReference.'/status');

        if ($response->status() === 404) {
            // Confirmed Midtrans behavior: no payment method chosen yet.
            return new PaymentStatusData(providerReference: $providerReference, status: 'pending');
        }

        $body = $response->json();

        return new PaymentStatusData(
            providerReference: $providerReference,
            status: $this->normalizeStatus($body['transaction_status'] ?? 'pending', $body['fraud_status'] ?? null),
            amountPaid: isset($body['gross_amount']) ? (int) $body['gross_amount'] : null,
        );
    }

    /**
     * Confirmed signature scheme from Midtrans documentation: the
     * notification payload includes a signature_key, computed as
     * SHA512(order_id + status_code + gross_amount + ServerKey).
     * This MUST be recomputed and compared — never trust the payload
     * without this check, per Architecture v1 §8.4's webhook security
     * requirement.
     */
    public function verifyWebhookSignature(Request $request): bool
    {
        $credentials = $this->credentials();
        $payload = $request->json()->all();

        $expectedSignature = hash(
            'sha512',
            ($payload['order_id'] ?? '').
            ($payload['status_code'] ?? '').
            ($payload['gross_amount'] ?? '').
            $credentials['server_key']
        );

        return hash_equals($expectedSignature, $payload['signature_key'] ?? '');
    }

    /**
     * IMPORTANT — confirmed Midtrans behavior this method must respect:
     * multiple notifications may arrive for one Order ID as the customer
     * attempts different payment methods before succeeding. This method
     * normalizes EVERY notification it's given; it is PaymentService's
     * job (not this gateway's) to only act on a normalized 'success'
     * status and to treat repeated 'failed' notifications for the same
     * order as informational, not as a final outcome.
     */
    public function parseWebhookPayload(Request $request): WebhookPayloadData
    {
        $payload = $request->json()->all();

        return new WebhookPayloadData(
            providerReference: $payload['transaction_id'],
            orderNumber: $payload['order_id'], // stable across multiple attempts for the same order — see WebhookPayloadData's docblock
            status: $this->normalizeStatus($payload['transaction_status'] ?? 'pending', $payload['fraud_status'] ?? null),
            amountPaid: (int) ($payload['gross_amount'] ?? 0),
            rawPayload: $payload,
        );
    }

    public function supportsDynamicQris(): bool
    {
        return true; // confirmed via research — real per-transaction QR generation
    }

    public function providerKey(): string
    {
        return 'midtrans';
    }

    /**
     * Confirmed Midtrans transaction_status values: 'capture'/'settlement'
     * (success, but capture additionally requires fraud_status='accept'
     * to be treated as genuinely successful — a fraud_status of
     * 'challenge' or 'deny' on a capture must NOT be normalized to
     * success), 'pending', 'deny', 'cancel', 'expire', 'failure'.
     */
    private function normalizeStatus(string $transactionStatus, ?string $fraudStatus): string
    {
        if ($transactionStatus === 'settlement') {
            return 'success';
        }

        if ($transactionStatus === 'capture') {
            return $fraudStatus === 'accept' ? 'success' : 'pending';
        }

        if (in_array($transactionStatus, ['deny', 'cancel', 'expire', 'failure'], true)) {
            return 'failed';
        }

        return 'pending';
    }

    private function baseUrl(): string
    {
        $credentials = $this->credentials();

        return ($credentials['is_production'] ?? false) ? self::PRODUCTION_BASE_URL : self::SANDBOX_BASE_URL;
    }

    private function credentials(): array
    {
        return json_decode($this->provider->credentials_encrypted, true) ?? [];
    }
}
