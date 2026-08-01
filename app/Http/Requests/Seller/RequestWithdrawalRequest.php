<?php

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Flows v1 Flow 7. Amount validation against available balance happens
 * in WithdrawalService::requestWithdrawal() (a business rule, not a
 * format rule), not here — this Request only validates shape/presence,
 * consistent with the Phase 1 Domain Architecture's separation between
 * "is this input well-formed" (Request) and "is this action allowed"
 * (Service).
 */
class RequestWithdrawalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->isSeller();
    }

    public function rules(): array
    {
        return [
            'payout_method_id' => ['required', 'integer', 'exists:seller_payout_methods,id'],
            'amount_requested' => ['required', 'integer', 'min:1'],
        ];
    }
}
