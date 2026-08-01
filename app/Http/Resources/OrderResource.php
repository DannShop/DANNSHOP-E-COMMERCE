<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Shapes an Order for buyer-facing API output. Deliberately EXCLUDES
 * commission_amount and net_amount — a buyer has no business reason to
 * see DannShop's commission cut on their own purchase, and exposing it
 * is an unnecessary information leak about seller economics. The
 * Seller-facing equivalent (a separate resource, not this one) is
 * where commission_amount/net_amount belong, since the seller needs
 * that to understand their own payout.
 */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'order_number' => $this->order_number,
            'status' => $this->status,
            'gross_amount' => $this->gross_amount,
            'gross_amount_formatted' => 'Rp '.number_format($this->gross_amount, 0, ',', '.'),
            'payable_amount' => $this->displayPayableAmount(),
            'payable_amount_formatted' => 'Rp '.number_format($this->displayPayableAmount(), 0, ',', '.'),
            'product' => $this->whenLoaded('product', fn () => [
                'name' => $this->product->name,
                'slug' => $this->product->slug,
            ]),
            'store' => $this->whenLoaded('store', fn () => [
                'name' => $this->store->name,
                'slug' => $this->store->slug,
            ]),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
