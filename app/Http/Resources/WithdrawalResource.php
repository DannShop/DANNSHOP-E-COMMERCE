<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WithdrawalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'amount_requested' => $this->amount_requested,
            'amount_requested_formatted' => 'Rp '.number_format($this->amount_requested, 0, ',', '.'),
            'fee_amount' => $this->fee_amount,
            'amount_payable' => $this->amount_payable,
            'amount_payable_formatted' => 'Rp '.number_format($this->amount_payable, 0, ',', '.'),
            'status' => $this->status,
            'can_be_cancelled' => $this->canBeCancelledBySeller(),
            'payout_method' => $this->whenLoaded('payoutMethod', fn () => [
                'label' => $this->payoutMethod->label,
                'destination_type' => $this->payoutMethod->destination_type,
                // destination_details_encrypted is NEVER exposed via API,
                // even to the seller who owns it — Database Architecture
                // v2 §3.2a's encryption exists precisely so this data has
                // a narrow, audited access path (Security finding #13's
                // sensitive_data_access_logs), not a casual API field.
                // The seller sees their own label/type, which is enough
                // to recognize "yes, this is my BCA account."
            ]),
            'failure_reason' => $this->failure_reason,
            'created_at' => $this->created_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
        ];
    }
}
