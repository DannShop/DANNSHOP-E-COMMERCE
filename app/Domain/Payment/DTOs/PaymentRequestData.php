<?php

namespace App\Domain\Payment\DTOs;

/**
 * What OrderService/PaymentService hand to a PaymentGatewayInterface
 * implementation to initiate a payment. amount here is always the
 * order's payable amount (which may include the static-QRIS uniqueness
 * offset) — see Order::displayPayableAmount().
 */
final readonly class PaymentRequestData
{
    public function __construct(
        public int $orderId,
        public string $orderNumber,
        public int $amount,
        public string $buyerEmail,
        public string $buyerPhone,
        public ?string $description = null,
    ) {
    }
}
