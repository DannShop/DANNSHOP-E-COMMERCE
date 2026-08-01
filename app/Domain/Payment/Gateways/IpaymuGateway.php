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
 * Architecture v1 §8.1. Implements PaymentGatewayInterface for iPaymu
 * — lowest priority of the four new gateways alongside Duitku. Wildan
 * does not yet have an account.
 *
 * IMPORTANT OPERATIONAL NOTE, not just a technical one: iPaymu requires
 * a KYC (Know Your Customer) process before QRIS can be activated —
 * confirmed via research: individuals need e-KTP + NPWP, businesses
 * need director's KTP + company NPWP + Akta Pendirian/NIB. This is NOT
 * instant like Midtrans sandbox registration — factor this into any
 * timeline if iPaymu becomes the chosen provider.
 *
 * CONFIRMED VIA RESEARCH:
 * - Separate base URLs for production (my.ipaymu.com) and sandbox
 *   (sandbox.ipaymu.com).
 * - QRIS minimum transaction Rp 10.000, maximum Rp 5.000.000 (varies by
 *   e-wallet policy) — this is a REAL constraint that should be
 *   validated at checkout time if iPaymu is the active provider; an
 *   order below/above this range will fail at the gateway even if
 *   DannShop's own logic allows it.
 * - Webhook arrives at a parameter/endpoint called "unotify" via POST.
 * - Official sample code repositories exist on GitHub
 *   (ipaymu/ipaymu-payment-v2-sample-php) but no Composer-installable
 *   SDK package was confirmed.
 *
 * UNCONFIRMED, flagged honestly and significantly: iPaymu's signature
 * generation is documented in a separate PDF
 * (iPaymu-signature-documentation-v2.pdf) that was NOT read in full
 * during this session's research — the signature implementation below
 * is a best-effort placeholder structure based on common iPaymu sample
 * code patterns referenced indirectly, and MUST be verified against
 * that PDF or the GitHub sample repository before this gateway is
 * trusted with a real transaction. This is the weakest-verified
 * gateway of the four new ones.
 */
class IpaymuGateway implements PaymentGatewayInterface
{
    private const PRODUCTION_BASE_URL = 'https://my.ipaymu.com/api/v2';
    private const SANDBOX_BASE_URL = 'https://sandbox.ipaymu.com/api/v2';

    private const QRIS_MIN_AMOUNT = 10_000;
    private const QRIS_MAX_AMOUNT = 5_000_000;

    public function __construct(
        private PaymentProvider $provider,
    ) {
    }

    public function createPayment(PaymentRequestData $request): PaymentResponseData
    {
        if ($request->amount < self::QRIS_MIN_AMOUNT || $request->amount > self::QRIS_MAX_AMOUNT) {
            // Confirmed real gateway-level constraint — fail clearly
            // rather than letting iPaymu reject it with a less useful
            // error after the fact.
            throw new \DomainException(
                "Amount Rp{$request->amount} is outside iPaymu QRIS limits (Rp".self::QRIS_MIN_AMOUNT.' - Rp'.self::QRIS_MAX_AMOUNT.').'
            );
        }

        $credentials = $this->credentials();

        // TODO (Wildan): signature generation below is UNVERIFIED — see
        // class docblock. Confirm against
        // iPaymu-signature-documentation-v2.pdf or the official GitHub
        // PHP sample before trusting this in production.
        $body = json_encode([
            'product' => [$request->description ?? 'DannShop Order'],
            'qty' => [1],
            'price' => [$request->amount],
            'returnUrl' => config('app.url').'/payment/return',
            'notifyUrl' => config('app.url').'/api/webhooks/ipaymu',
            'referenceId' => $request->orderNumber,
        ]);

        $signature = $this->generateSignature('POST', $body, $credentials);

        $response = Http::withHeaders([
            'va' => $credentials['va'],
            'signature' => $signature,
            'timestamp' => now()->format('YmdHis'),
        ])->withBody($body, 'application/json')
            ->post($this->baseUrl().'/payment/direct');

        if (! $response->successful()) {
            throw new \RuntimeException('iPaymu payment creation failed: '.$response->body());
        }

        $responseBody = $response->json();

        return new PaymentResponseData(
            providerReference: $responseBody['Data']['SessionID'] ?? $responseBody['Data']['TransactionId'] ?? '',
            isDynamicQris: true,
            qrisPayload: $responseBody['Data']['QrString'] ?? null,
        );
    }

    public function checkStatus(string $providerReference): PaymentStatusData
    {
        $credentials = $this->credentials();
        $body = json_encode(['transactionId' => $providerReference]);
        $signature = $this->generateSignature('POST', $body, $credentials);

        $response = Http::withHeaders([
            'va' => $credentials['va'],
            'signature' => $signature,
            'timestamp' => now()->format('YmdHis'),
        ])->withBody($body, 'application/json')
            ->post($this->baseUrl().'/transaction');

        $responseBody = $response->json();

        return new PaymentStatusData(
            providerReference: $providerReference,
            status: $this->normalizeStatus($responseBody['Data']['Status'] ?? null),
        );
    }

    /**
     * UNVERIFIED — see class docblock. iPaymu's documented webhook
     * arrives at a parameter called "unotify"; the exact verification
     * mechanism for confirming it genuinely came from iPaymu was not
     * confirmed during this session.
     */
    public function verifyWebhookSignature(Request $request): bool
    {
        // Placeholder returning false until the real iPaymu webhook
        // verification scheme is confirmed — safe default, per the same
        // principle applied to other unverified gateways: better to
        // reject a real webhook (falling back to status polling) than
        // to silently trust an unverified one.
        return false;
    }

    public function parseWebhookPayload(Request $request): WebhookPayloadData
    {
        throw new \RuntimeException(
            'IpaymuGateway::parseWebhookPayload() is not implemented — pending confirmation of the real "unotify" '.
            'webhook payload shape and verification scheme from iPaymu-signature-documentation-v2.pdf.'
        );
    }

    public function supportsDynamicQris(): bool
    {
        return true;
    }

    public function providerKey(): string
    {
        return 'ipaymu';
    }

    private function normalizeStatus(?string $ipaymuStatus): string
    {
        return match ($ipaymuStatus) {
            '1' => 'success', // confirmed-pattern guess: iPaymu commonly uses numeric status codes, '1' = berhasil in related docs — NOT independently verified this session
            '0' => 'pending',
            default => 'failed',
        };
    }

    private function generateSignature(string $method, string $body, array $credentials): string
    {
        // UNVERIFIED FORMULA — placeholder following a commonly-
        // referenced iPaymu v2 pattern (HMAC-SHA256 of a constructed
        // string using the API key as secret), but NOT confirmed
        // against the actual signature PDF during this session. Do not
        // trust this without verification.
        $bodyHash = strtolower(hash('sha256', $body));
        $stringToSign = $method.':'.$credentials['va'].':'.$bodyHash.':'.$credentials['api_key'];

        return hash_hmac('sha256', $stringToSign, $credentials['api_key']);
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
