<?php

namespace App\Domain\Order\DTOs;

/**
 * Flows v1 Flow 4 (Checkout). buyerUserId is nullable — guest checkout
 * is mandatory for MVP conversion (Architecture v1 §9's guest-checkout
 * requirement); buyerEmail/buyerPhone are always captured regardless,
 * since they are the only path to guest order recovery.
 */
final readonly class CreateOrderData
{
    public function __construct(
        public int $productId,
        public string $buyerEmail,
        public string $buyerPhone,
        public ?int $buyerUserId = null,
    ) {
    }
}
