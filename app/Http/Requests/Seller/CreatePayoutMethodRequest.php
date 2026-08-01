<?php

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreatePayoutMethodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->isSeller();
    }

    public function rules(): array
    {
        return [
            'label' => ['required', 'string', 'max:100'],
            'destination_type' => ['required', 'string', Rule::in(['bank_transfer', 'ewallet'])],
            'account_number' => ['required', 'string', 'max:50'],
            'account_holder_name' => ['required', 'string', 'max:100'],
            'bank_or_provider_name' => ['required', 'string', 'max:100'],
        ];
    }
}
