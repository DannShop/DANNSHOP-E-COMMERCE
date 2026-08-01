<?php

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

class UpdateStoreProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->isSeller();
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:100'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:500'],
            'social_links' => ['sometimes', 'array'],
            'social_links.instagram' => ['sometimes', 'nullable', 'url'],
            'social_links.tiktok' => ['sometimes', 'nullable', 'url'],
            'social_links.whatsapp' => ['sometimes', 'nullable', 'string'],
        ];
    }
}
