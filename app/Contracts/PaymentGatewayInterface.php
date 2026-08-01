<?php

namespace App\Contracts;

use App\Domain\Payment\DTOs\PaymentRequestData;
use App\Domain\Payment\DTOs\PaymentResponseData;
use App\Domain\Payment\DTOs\PaymentStatusData;
use App\Domain\Payment\DTOs\WebhookPayloadData;
use Illuminate\Http\Request;

/**
 * Architecture v1 §8.1. Every concrete gateway (OkeConnectGateway,
 * OrderKuotaGateway, QiospayGateway — and future ones like
 * MidtransGateway) implements this. GopayGateway was deliberately
 * dropped from MVP scope (Wildan's explicit decision, this session):
 * a standard GoPay Merchant account has no official API, only
 * unofficial automation tools that carry real ToS risk. Business
 * logic in OrderService and PaymentService NEVER reference a concrete
 * gateway class directly — they depend only on this interface,
 * resolved at runtime by PaymentGatewayManager based on the active row
 * in payment_providers. This is what makes "switching providers
 * requires no source code changes" (Architecture v1, Payment System
 * section) an enforced property of the codebase, not just an intention.
 */
interface PaymentGatewayInterface
{
    /**
     * Initiate a payment for an order. Returns whatever the buyer needs
     * to actually pay — a QRIS payload (dynamic or static) or a redirect
     * URL, depending on what this gateway and the order support.
     */
    public function createPayment(PaymentRequestData $request): PaymentResponseData;

    /**
     * Poll the provider directly for an order's current payment status.
     * This is the fallback path the reconciliation job uses for orders
     * stuck in 'pending' past their expected window (Architecture v1
     * §8.4) — it must work independently of whether a webhook ever
     * arrives.
     */
    public function checkStatus(string $providerReference): PaymentStatusData;

    /**
     * Verify that an incoming webhook request actually originated from
     * this provider (signature check). This must be called and must
     * pass BEFORE any webhook payload is trusted or acted upon — a
     * forged webhook is a direct path to fraudulent wallet credit.
     */
    public function verifyWebhookSignature(Request $request): bool;

    /**
     * Parse a verified webhook request into a normalized DTO. Must only
     * be called after verifyWebhookSignature() has returned true.
     */
    public function parseWebhookPayload(Request $request): WebhookPayloadData;

    /**
     * Whether this gateway supports dynamic QRIS (unique QR per
     * transaction, amount embedded). Used by PaymentService to decide
     * whether the static-QRIS uniqueness-offset strategy
     * (Architecture v1 §8.3) needs to be applied for a given order.
     */
    public function supportsDynamicQris(): bool;

    /**
     * The provider_key this implementation corresponds to in the
     * payment_providers table — used by PaymentGatewayManager to
     * verify it resolved the correct class.
     */
    public function providerKey(): string;
}
