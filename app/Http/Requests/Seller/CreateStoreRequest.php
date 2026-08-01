<?php

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

class CreateStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // any authenticated user without a store yet may create one — checked in the controller
    }

    public function rules(): array
    {
        return [
            'slug' => ['required', 'string', 'max:50', 'regex:/^[a-z0-9\-]+$/', 'unique:stores,slug'],
            'name' => ['required', 'string', 'max:100'],
            'bio' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'URL toko hanya boleh berisi huruf kecil, angka, dan tanda hubung.',
            'slug.unique' => 'URL toko ini sudah digunakan, silakan pilih yang lain.',
        ];
    }
}
