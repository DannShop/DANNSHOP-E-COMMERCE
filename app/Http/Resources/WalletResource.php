<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Database Architecture v2 §6.3: total balance and available balance
 * are deliberately separate fields here, never collapsed into one
 * number — Flows v1 Flow 6's edge case is exactly the confusion that
 * happens when a seller sees only one balance figure while a
 * withdrawal is pending or a debt is being recovered. The frontend
 * (Gemini's seller dashboard) must show both, not just pick one.
 */
class WalletResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'balance' => $this->cached_balance,
            'balance_formatted' => 'Rp '.number_format($this->cached_balance, 0, ',', '.'),
            'available_balance' => $this->cached_available_balance,
            'available_balance_formatted' => 'Rp '.number_format($this->cached_available_balance, 0, ',', '.'),
            'outstanding_debt' => $this->cached_outstanding_debt,
            'outstanding_debt_formatted' => $this->cached_outstanding_debt > 0
                ? 'Rp '.number_format($this->cached_outstanding_debt, 0, ',', '.')
                : null,
            'has_outstanding_debt' => $this->hasOutstandingDebt(),
            'last_reconciled_at' => $this->last_reconciled_at?->toIso8601String(),
        ];
    }
}
