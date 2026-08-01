<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Unlike the buyer-facing OrderResource (which deliberately excludes
 * commission_amount/net_amount), this resource is for the SELLER's own
 * view of their orders — they need to see exactly what they're being
 * paid, which is precisely the information OrderResource hides from
 * buyers. Two separate resources for the same underlying Order model,
 * because the audience and what's appropriate to show genuinely differ.
 */
class SellerOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'order_number' => $this->order_number,
            'status' => $this->status,
            'gross_amount' => $this->gross_amount,
            'gross_amount_formatted' => 'Rp '.number_format($this->gross_amount, 0, ',', '.'),
            'commission_amount' => $this->commission_amount,
            'net_amount' => $this->net_amount,
            'net_amount_formatted' => 'Rp '.number_format($this->net_amount, 0, ',', '.'),
            'buyer_email' => $this->buyer_email,
            'product' => $this->whenLoaded('product', fn () => [
                'name' => $this->product->name,
                'slug' => $this->product->slug,
            ]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
