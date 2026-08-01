<?php

namespace App\Http\Controllers\Api\Public;

use App\Domain\Product\Models\Product;
use App\Domain\Store\Models\Store;
use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Http\Resources\StoreResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;

/**
 * Public-facing, unauthenticated-friendly per Architecture v1 §9.1.
 * Controllers stay thin — read-only queries here are simple enough
 * that they don't warrant a dedicated Service (no business logic,
 * no side effects, no domain rules to enforce) per the Phase 1 Domain
 * Architecture rule: "Controller may call Model directly only for
 * read-only queries with no business rule." Anything involving a
 * write (order creation, payment) goes through OrderService/
 * PaymentService instead — see CheckoutController.
 */
class StorefrontController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/stores/{slug}
     * Flows v1 Flow 2's "invalid or suspended slug" edge case: a
     * suspended store returns 404, not a 200 with status info exposed
     * — a buyer browsing a suspended store has no need to know it
     * exists at all, this isn't a case for a friendly "this store is
     * unavailable" message at the API layer (that's a frontend concern
     * if ever needed; the API simply doesn't reveal it).
     */
    public function show(string $slug): JsonResponse
    {
        $store = Store::query()
            ->where('slug', $slug)
            ->where('status', 'active')
            ->first();

        if ($store === null) {
            return $this->error('Toko tidak ditemukan.', [], 404);
        }

        return $this->success(new StoreResource($store));
    }

    /**
     * GET /api/stores/{slug}/products
     * Only active products are listed — draft/archived/out_of_stock
     * still show (out_of_stock specifically so the frontend can render
     * "Habis" rather than the product disappearing entirely, which
     * would look like a broken link to a buyer who saw it shared
     * earlier).
     */
    public function products(string $slug): JsonResponse
    {
        $store = Store::query()->where('slug', $slug)->where('status', 'active')->first();

        if ($store === null) {
            return $this->error('Toko tidak ditemukan.', [], 404);
        }

        $products = Product::query()
            ->where('store_id', $store->id)
            ->whereIn('status', ['active', 'out_of_stock'])
            ->with('category')
            ->orderBy('created_at', 'desc')
            ->get();

        return $this->success(ProductResource::collection($products));
    }

    /**
     * GET /api/stores/{slug}/products/{productSlug}
     */
    public function productDetail(string $slug, string $productSlug): JsonResponse
    {
        $store = Store::query()->where('slug', $slug)->where('status', 'active')->first();

        if ($store === null) {
            return $this->error('Toko tidak ditemukan.', [], 404);
        }

        $product = Product::query()
            ->where('store_id', $store->id)
            ->where('slug', $productSlug)
            ->whereIn('status', ['active', 'out_of_stock'])
            ->with('category')
            ->first();

        if ($product === null) {
            return $this->error('Produk tidak ditemukan.', [], 404);
        }

        return $this->success(new ProductResource($product));
    }
}
