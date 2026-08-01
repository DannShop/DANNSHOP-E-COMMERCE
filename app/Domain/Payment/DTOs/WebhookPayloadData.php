<?php

namespace App\Domain\Payment\DTOs;

/**
 * The normalized shape every Gateway's parseWebhookPayload() must
 * produce, regardless of how wildly different each provider's raw
 * webhook JSON looks. This normalization is exactly what lets
 * PaymentService's webhook handler stay provider-agnostic — it only
 * ever deals with this DTO, never raw provider payloads directly.
 *
 * orderNumber (added this session, fixing a real bug found during
 * Midtrans integration): Midtrans confirmed-documented behavior allows
 * MULTIPLE webhook notifications for a SINGLE Order ID, each with a
 * DIFFERENT transaction_id (e.g. a failed card attempt followed by a
 * successful QRIS payment). providerReference alone is therefore NOT
 * a reliable way to look up which DannShop order a webhook belongs to
 * — order_id (which Midtrans always echoes back unchanged across every
 * attempt) is the stable identifier. Every gateway's
 * parseWebhookPayload() must populate this from whatever field that
 * gateway uses to echo back the original order reference (Midtrans:
 * order_id: Xendit: reference_id/metadata.order_number: Duitku:
 * merchantOrderId).
 */
final readonly class WebhookPayloadData
{
    public function __construct(
        public string $providerReference,
        public string $orderNumber,
        public string $status, // 'success' | 'failed' — normalized
        public int $amountPaid,
        public array $rawPayload, // retained verbatim for payment_transactions.raw_payload — dispute/debugging evidence
    ) {
    }
}
