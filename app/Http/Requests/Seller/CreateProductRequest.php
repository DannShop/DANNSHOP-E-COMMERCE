<?php

namespace App\Http\Requests\Seller;

use App\Domain\Product\Services\ProductTypeMapper;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Per Wildan's decision: the seller only ever picks product_type from
 * this form — fulfillment_mode/stock_mode are never accepted as input
 * (see CreateProductData's docblock). The 'in' rule below is built
 * dynamically from ProductTypeMapper rather than a hardcoded list, so
 * the validation rule and the mapping logic can never silently drift
 * apart from each other.
 */
class CreateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->isSeller();
    }

    public function rules(): array
    {
        $availableTypes = array_map(
            fn (array $t) => $t['type'],
            array_filter(ProductTypeMapper::allTypes(), fn (array $t) => $t['available']),
        );

        return [
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string'],
            'price' => ['required', 'integer', 'min:0'],
            'product_type' => ['required', 'string', Rule::in($availableTypes)],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'product_type.in' => 'Jenis produk ini belum tersedia untuk dijual.',
        ];
    }
}
