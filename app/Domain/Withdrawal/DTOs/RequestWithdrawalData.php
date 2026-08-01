<?php

namespace App\Domain\Withdrawal\DTOs;

final readonly class RequestWithdrawalData
{
    public function __construct(
        public int $storeId,
        public int $payoutMethodId,
        public int $amountRequested,
        public int $feeAmount,
    ) {
    }
}
