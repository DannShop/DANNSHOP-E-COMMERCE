<?php

namespace App\Domain\Product\DTOs;

/**
 * What the seller's "Add Product" form submits. Deliberately does NOT
 * include fulfillment_mode or stock_mode — per Wildan's decision, the
 * seller never chooses those directly; ProductService::createProduct()
 * derives them via ProductTypeMapper from productType alone.
 */
final readonly class CreateProductData
{
    public function __construct(
        public int $storeId,
        public string $name,
        public string $productType,
        public int $price,
        public ?int $categoryId = null,
        public ?string $description = null,
        public ?int $stockCount = null, // only meaningful if the seller is setting a capped quantity on a 'service' type in the future — unused for MVP's automatic mapping, kept for forward compatibility
    ) {
    }
}
