<?php

namespace App\Domain\Payment\DTOs;

/**
 * What a Gateway returns after createPayment(). qrisPayload and
 * redirectUrl are both nullable because different gateways/methods
 * return different things — a gateway returning a QRIS string sets
 * qrisPayload and leaves redirectUrl null, and vice versa for a
 * redirect-based flow. PaymentService is responsible for handling
 * whichever one comes back; the UI layer renders accordingly.
 */
final readonly class PaymentResponseData
{
    public function __construct(
        public string $providerReference,
        public bool $isDynamicQris,
        public ?string $qrisPayload = null,
        public ?string $redirectUrl = null,
        public ?\DateTimeImmutable $expiresAt = null,
    ) {
    }
}
