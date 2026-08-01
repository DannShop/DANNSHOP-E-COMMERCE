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
 * Architecture v1 §8.1. Implements PaymentGatewayInterface for Xendit
 * — secondary priority gateway (Wildan does not yet have a Xendit
 * account; this is built ready-to-use but not yet account-tested,
 * unlike MidtransGateway).
 *
 * CONFIRMED VIA RESEARCH (this session):
 * - Xendit has TWO different QRIS APIs: the legacy /qr_codes endpoint
 *   and the newer /payment_requests endpoint. This implementation uses
 *   /payment_requests, Xendit's current direction, per the research
 *   summary's recommendation — but this should be reconfirmed against
 *   Wildan's actual dashboard once an account exists, in case the
 *   legacy endpoint is what's actually provisioned.
 * - QRIS is DYNAMIC (real per-transaction QR), confirmed.
 * - Webhook verification uses a separate "Webhook Verification Token"
 *   (not the API secret key), obtained from the Xendit dashboard's
 *   Settings > Developers > Webhooks page.
 * - No official Xendit PHP SDK exists; this implementation uses direct
 *   HTTP calls, consistent with how Midtrans is implemented here too.
 *
 * UNCONFIRMED, flagged honestly: the exact webhook payload field names
 * for /payment_requests events (e.g. "payment_request.succeeded") were
 * not independently verified against a real captured payload during
 * this session — the shape below is built from Xendit's documented
 * examples but should be confirmed against an actual test webhook
 * before this gateway is used in production.
 */
class XenditGateway implements PaymentGatewayInterface
{
    private const BASE_URL = 'https://api.xendit.co';

    public function __construct(
        private PaymentProvider $provider,
    ) {
    }

    public function createPayment(PaymentRequestData $request): PaymentResponseData
    {
        $credentials = $this->credentials();

        $response = Http::withBasicAuth($credentials['secret_key'], '')
            ->post(self::BASE_URL.'/payment_requests', [
                'reference_id' => $request->orderNumber,
                'currency' => 'IDR',
                'amount' => $request->amount,
                'payment_method' => [
                    'type' => 'QR_CODE',
                    'reusability' => 'ONE_TIME_USE',
                    'qrCode' => [
                        'channelCode' => 'QRIS',
                    ],
                ],
                'metadata' => [
                    'order_number' => $request->orderNumber,
                ],
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Xendit payment creation failed: '.$response->body());
        }

        $body = $response->json();

        // TODO (Wildan): confirm this exact nesting once a real account
        // exists — based on Xendit's documented examples, the QR string
        // lives under payment_method.qr_code.channel_properties.qr_string,
        // but this should be verified against a live sandbox response.
        $qrString = $body['payment_method']['qr_code']['channel_properties']['qr_string'] ?? null;

        return new PaymentResponseData(
            providerReference: $body['id'],
            isDynamicQris: true,
            qrisPayload: $qrString,
        );
    }

    public function checkStatus(string $providerReference): PaymentStatusData
    {
        $credentials = $this->credentials();

        $response = Http::withBasicAuth($credentials['secret_key'], '')
            ->get(self::BASE_URL.'/payment_requests/'.$providerReference);

        $body = $response->json();

        return new PaymentStatusData(
            providerReference: $providerReference,
            status: $this->normalizeStatus($body['status'] ?? 'PENDING'),
            amountPaid: isset($body['amount']) ? (int) $body['amount'] : null,
        );
    }

    /**
     * CONFIRMED MECHANISM (Webhook Verification Token, separate from
     * API key), but the EXACT comparison method (is it a header value
     * compared directly, or a computed HMAC?) was not independently
     * verified during this session's research — Xendit's own docs
     * reference "callback-token" header verification, but this
     * implementation should be checked against the dashboard's webhook
     * setup page before trusting it in production.
     */
    public function verifyWebhookSignature(Request $request): bool
    {
        $credentials = $this->credentials();
        $receivedToken = $request->header('x-callback-token');

        return hash_equals($credentials['webhook_verification_token'] ?? '', $receivedToken ?? '');
    }

    public function parseWebhookPayload(Request $request): WebhookPayloadData
    {
        $payload = $request->json()->all();

        return new WebhookPayloadData(
            providerReference: $payload['data']['id'] ?? $payload['id'] ?? '',
            orderNumber: $payload['data']['metadata']['order_number'] ?? $payload['data']['reference_id'] ?? $payload['reference_id'] ?? '',
            status: $this->normalizeStatus($payload['data']['status'] ?? $payload['status'] ?? 'PENDING'),
            amountPaid: (int) ($payload['data']['amount'] ?? $payload['amount'] ?? 0),
            rawPayload: $payload,
        );
    }

    public function supportsDynamicQris(): bool
    {
        return true;
    }

    public function providerKey(): string
    {
        return 'xendit';
    }

    private function normalizeStatus(string $xenditStatus): string
    {
        return match (strtoupper($xenditStatus)) {
            'SUCCEEDED', 'COMPLETED' => 'success',
            'FAILED', 'EXPIRED' => 'failed',
            default => 'pending',
        };
    }

    private function credentials(): array
    {
        return json_decode($this->provider->credentials_encrypted, true) ?? [];
    }
}
