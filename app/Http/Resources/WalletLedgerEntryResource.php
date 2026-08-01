<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Database Architecture v2 §6.2: balance_after is exposed here exactly
 * as stored (write-once at insert time) — this is what lets a seller's
 * ledger history page show "your balance after this transaction was
 * X" without the frontend needing to recompute a running sum itself.
 */
class WalletLedgerEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->entry_type,
            'amount' => $this->amount,
            'amount_formatted' => ($this->isCredit() ? '+' : '').'Rp '.number_format(abs($this->amount), 0, ',', '.'),
            'is_credit' => $this->isCredit(),
            'balance_after' => $this->balance_after,
            'balance_after_formatted' => 'Rp '.number_format($this->balance_after, 0, ',', '.'),
            'note' => $this->note,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
