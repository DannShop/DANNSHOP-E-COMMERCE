<?php

namespace App\Domain\Payment\DTOs;

/**
 * Returned by checkStatus() — the reconciliation job's view into a
 * provider's record of a transaction, independent of whether a webhook
 * ever arrived for it (Architecture v1 §8.4).
 */
final readonly class PaymentStatusData
{
    public function __construct(
        public string $providerReference,
        public string $status, // 'pending' | 'success' | 'failed' — normalized across all gateways
        public ?int $amountPaid = null,
        public ?\DateTimeImmutable $confirmedAt = null,
    ) {
    }
}
