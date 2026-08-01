<?php

namespace App\Http\Requests\Public;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Flows v1 Flow 4's security note: guest checkout data validation must
 * happen server-side, not just client-side (which is trivially
 * bypassable) — these fields are the buyer's only path to order
 * recovery and dispute communication, so garbage data here directly
 * creates support burden later.
 */
class CreateOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // guest checkout is intentional — no auth required, per Architecture v1 §9
    }

    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'buyer_email' => ['required', 'email', 'max:255'],
            'buyer_phone' => ['required', 'string', 'max:20', 'regex:/^[0-9+\-\s]+$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'product_id.exists' => 'Produk yang dipilih tidak ditemukan.',
            'buyer_email.email' => 'Format email tidak valid.',
            'buyer_phone.regex' => 'Format nomor HP tidak valid.',
        ];
    }
}
