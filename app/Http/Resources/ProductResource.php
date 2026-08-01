<?php

namespace App\Http\Resources;

use App\Domain\Product\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Shapes a Product for API output. Deliberately never exposes
 * fulfillment_mode/stock_mode raw enum values to the frontend — per
 * Wildan's decision (this session), sellers and buyers never see these
 * technical fields directly; the frontend only needs product_type and
 * a simple boolean/derived field for stock availability.
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Product $this */
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'price' => $this->price,
            'price_formatted' => 'Rp '.number_format($this->price, 0, ',', '.'),
            'thumbnail_url' => $this->thumbnail_path ? asset('storage/'.$this->thumbnail_path) : null,
            'product_type' => $this->product_type,
            'status' => $this->status,
            'is_available' => $this->isActive() && $this->resolveStockAvailability(),
            'category' => $this->whenLoaded('category', fn () => [
                'id' => $this->category->id,
                'name' => $this->category->name,
                'slug' => $this->category->slug,
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * Derives a simple true/false the frontend can use directly,
     * instead of needing to understand stock_mode's enum values at all
     * — this is the API-layer equivalent of the "seller never sees
     * fulfillment_mode" decision, applied to buyers too.
     */
    private function resolveStockAvailability(): bool
    {
        return match ($this->stock_mode) {
            'unlimited', 'provider_managed' => true,
            'limited' => $this->stock_count > 0,
            'license_pool' => $this->assets()->where('status', 'available')->exists(),
            default => false,
        };
    }
}
