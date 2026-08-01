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
 * Architecture v1 §8.1. Implements PaymentGatewayInterface for Duitku
 * — LOWEST confidence of the four new gateways. Wildan does not yet
 * have an account, AND this session's research found Duitku's own
 * documentation to be internally inconsistent.
 *
 * CONFIRMED VIA RESEARCH BUT WITH A SERIOUS CAVEAT: Duitku has at
 * least THREE different API surfaces (Pop API, a legacy "regular"
 * API, and a SNAP-based API following Bank Indonesia's BI-SNAP
 * standard) — this implementation uses the "regular" Create Invoice
 * API as it's the most commonly documented/referenced pattern, but
 * this is a GUESS at which surface matches Wildan's actual account,
 * not a confirmed fact.
 *
 * SIGNATURE SCHEME IS THE BIGGEST UNCERTAINTY HERE: Duitku's own
 * documentation simultaneously states that MD5 and SHA256 signatures
 * are "obsolete," recommends HMAC, but STILL shows worked code
 * examples using `md5($merchantCode . $merchantOrderId . $paymentAmount
 * . $merchantKey)` for the create-invoice signature and
 * `md5($merchantCode . $amount . $merchantOrderId . $apiKey)` for the
 * callback signature. This implementation uses the MD5 scheme shown in
 * the worked examples because it's the only one with a concrete,
 * reproducible formula found — but given Duitku's own docs flag MD5 as
 * obsolete, THIS MUST BE RECONFIRMED against Wildan's actual merchant
 * dashboard before any real transaction relies on it. Do not trust
 * this signature implementation blindly.
 *
 * Official PHP SDK exists (duitkupg/duitku-php via Composer) and may
 * be a SAFER choice than this hand-rolled implementation specifically
 * because Duitku's own SDK would track whichever signature scheme is
 * currently correct — worth switching to once Wildan has an account
 * to test against.
 */
class DuitkuGateway implements PaymentGatewayInterface
{
    private const SANDBOX_BASE_URL = 'https://sandbox.duitku.com/webapi/api/merchant';
    private const PRODUCTION_BASE_URL = 'https://passport.duitku.com/webapi/api/merchant';

    public function __construct(
        private PaymentProvider $provider,
    ) {
    }

    public function createPayment(PaymentRequestData $request): PaymentResponseData
    {
        $credentials = $this->credentials();
        $merchantCode = $credentials['merchant_code'];
        $merchantKey = $credentials['merchant_key'];

        // UNVERIFIED SIGNATURE SCHEME — see class docblock. This is the
        // formula shown in Duitku's worked examples, but their docs
        // also call MD5 "obsolete." Confirm before trusting.
        $signature = md5($merchantCode.$request->orderNumber.$request->amount.$merchantKey);

        $response = Http::post($this->baseUrl().'/createinvoice', [
            'merchantCode' => $merchantCode,
            'paymentAmount' => $request->amount,
            'paymentMethod' => 'SP', // TODO (Wildan): confirm the correct payment method code for QRIS in your account — 'SP' is a guess based on indirect references, not a confirmed code
            'merchantOrderId' => $request->orderNumber,
            'productDetails' => $request->description ?? 'DannShop Order',
            'email' => $request->buyerEmail,
            'phoneNumber' => $request->buyerPhone,
            'signature' => $signature,
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Duitku payment creation failed: '.$response->body());
        }

        $body = $response->json();

        return new PaymentResponseData(
            providerReference: $body['reference'],
            isDynamicQris: true, // assumed true for Create Invoice QRIS — NOT independently confirmed this session
            redirectUrl: $body['paymentUrl'] ?? null, // Duitku's Create Invoice returns a hosted payment page URL, not a raw QR string directly
        );
    }

    public function checkStatus(string $providerReference): PaymentStatusData
    {
        $credentials = $this->credentials();
        $merchantCode = $credentials['merchant_code'];
        $merchantKey = $credentials['merchant_key'];

        // TODO (Wildan): the check-status signature formula shown in
        // Duitku's docs differs from the create-invoice one
        // (merchantCode + merchantOrderId + merchantKey, no amount) —
        // confirm this is still accurate for your account before relying
        // on it.
        $signature = md5($merchantCode.$providerReference.$merchantKey);

        $response = Http::post($this->baseUrl().'/transactionStatus', [
            'merchantCode' => $merchantCode,
            'merchantOrderId' => $providerReference,
            'signature' => $signature,
        ]);

        $body = $response->json();

        return new PaymentStatusData(
            providerReference: $providerReference,
            status: $this->normalizeStatus($body['statusCode'] ?? '01'),
        );
    }

    /**
     * UNVERIFIED — see class docblock's signature caveat in full.
     */
    public function verifyWebhookSignature(Request $request): bool
    {
        $credentials = $this->credentials();
        $payload = $request->all();

        $expected = md5(
            ($payload['merchantCode'] ?? '').
            ($payload['amount'] ?? '').
            ($payload['merchantOrderId'] ?? '').
            $credentials['merchant_key']
        );

        return hash_equals($expected, $payload['signature'] ?? '');
    }

    public function parseWebhookPayload(Request $request): WebhookPayloadData
    {
        $payload = $request->all();

        return new WebhookPayloadData(
            providerReference: $payload['reference'] ?? $payload['merchantOrderId'] ?? '',
            orderNumber: $payload['merchantOrderId'] ?? '',
            status: $this->normalizeStatus($payload['resultCode'] ?? '01'),
            amountPaid: (int) ($payload['amount'] ?? 0),
            rawPayload: $payload,
        );
    }

    public function supportsDynamicQris(): bool
    {
        return true; // assumed, not independently confirmed this session
    }

    public function providerKey(): string
    {
        return 'duitku';
    }

    private function normalizeStatus(string $statusCode): string
    {
        // Confirmed from docs: "00" = SUCCESS in multiple Duitku examples.
        return match ($statusCode) {
            '00' => 'success',
            '01' => 'pending',
            default => 'failed',
        };
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
