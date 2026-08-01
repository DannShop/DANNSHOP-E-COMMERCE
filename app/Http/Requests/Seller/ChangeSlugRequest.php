<?php

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

class ChangeSlugRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->isSeller();
    }

    public function rules(): array
    {
        return [
            'slug' => ['required', 'string', 'max:50', 'regex:/^[a-z0-9\-]+$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'URL toko hanya boleh berisi huruf kecil, angka, dan tanda hubung.',
        ];
    }
}
