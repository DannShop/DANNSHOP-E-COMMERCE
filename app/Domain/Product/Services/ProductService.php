<?php

namespace App\Domain\Product\Services;

use App\Domain\Product\DTOs\CreateProductData;
use App\Domain\Product\Models\Product;
use App\Domain\Product\Models\ProductAsset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Flows v1 Flow 3 (Product Creation)'s concurrency edge case, plus
 * Wildan's decision (this session): sellers pick only a product_type
 * in the Add Product form — fulfillment_mode and stock_mode are always
 * derived via ProductTypeMapper, never chosen directly by the seller.
 * reserveAsset() is the only sanctioned way to claim a product_assets
 * row — it must always be called inside the same DB transaction as
 * order creation (see OrderService::createOrder()), never standalone,
 * so that a failure to create the order afterward can roll back the
 * reservation atomically rather than leaking a permanently-reserved
 * asset.
 */
class ProductService
{
    /**
     * Flows v1 Flow 3, steps 1–5 + Wildan's "seller only picks
     * product_type" decision. fulfillment_mode/stock_mode are never
     * accepted as input from the caller — they are always derived here,
     * in exactly one place, via ProductTypeMapper. This is what
     * guarantees a seller can never end up with an invalid combination
     * like product_type='service' + stock_mode='license_pool'.
     */
    public function createProduct(CreateProductData $data): Product
    {
        $mapping = ProductTypeMapper::map($data->productType);

        if (! ProductTypeMapper::isAvailable($data->productType)) {
            throw new \DomainException(
                "Product type '{$data->productType}' is not yet available for sale — its provider integration ".
                'has not been built (Database Architecture v2 §3.6, 🟡 future work).'
            );
        }

        return Product::create([
            'store_id' => $data->storeId,
            'category_id' => $data->categoryId,
            'name' => $data->name,
            'slug' => $this->generateUniqueSlug($data->storeId, $data->name),
            'description' => $data->description,
            'price' => $data->price,
            'product_type' => $data->productType,
            'fulfillment_mode' => $mapping['fulfillment_mode'],
            'stock_mode' => $mapping['stock_mode'],
            'stock_count' => $mapping['stock_mode'] === 'limited' ? $data->stockCount : null,
            'status' => 'draft', // seller publishes explicitly afterward — see publish() below
        ]);
    }

    /**
     * Flows v1 Flow 3's "publishes a product with zero stock" edge
     * case: for license_pool products, publishing without any
     * available assets uploaded yet would let buyers see an "in stock"
     * product that can never actually be reserved. Block that here
     * rather than discovering it as a confusing checkout failure later.
     */
    public function publish(Product $product): Product
    {
        if ($product->stock_mode === 'license_pool' && ! $product->assets()->where('status', 'available')->exists()) {
            throw new \DomainException('Cannot publish a license_pool product with no available assets uploaded yet.');
        }

        if ($product->usesUnlimitedAsset() && ! $product->assets()->where('asset_type', 'file')->exists()) {
            throw new \DomainException('Cannot publish a digital_file product with no file uploaded yet.');
        }

        $product->status = 'active';
        $product->save();

        return $product;
    }

    /**
     * Flows v1 Flow 2's slug-collision pattern, applied to products:
     * unique per store (Database Architecture v2 §3.4's composite
     * UNIQUE(store_id, slug)), not globally — "ebook-1" can exist under
     * many different sellers.
     */
    private function generateUniqueSlug(int $storeId, string $name): string
    {
        $base = Str::slug($name);
        $slug = $base;
        $attempt = 1;

        while (Product::query()->where('store_id', $storeId)->where('slug', $slug)->exists()) {
            $attempt++;
            $slug = "{$base}-{$attempt}";
        }

        return $slug;
    }

    /**
     * Locks and claims one available asset for a license_pool /
     * automatic-fulfillment product. Throws if none are available —
     * the caller (OrderService) is responsible for translating that
     * into an "out of stock" response to the buyer, ideally also
     * flipping the product's status to 'out_of_stock' at that point
     * (Flows v1 Flow 3's "publishes a product with zero stock" edge
     * case, applied reactively here when the last unit sells).
     */
    public function reserveAsset(Product $product, int $orderId): ProductAsset
    {
        // SELECT ... FOR UPDATE on the candidate row — this is the
        // exact locking pattern Database Architecture v2 §5's index
        // strategy note calls out: the (product_id, status) index is
        // what makes this query performant under concurrent buyers.
        $asset = ProductAsset::query()
            ->where('product_id', $product->id)
            ->where('status', 'available')
            ->lockForUpdate()
            ->first();

        if ($asset === null) {
            throw new \DomainException("No available asset to reserve for product {$product->id}.");
        }

        $asset->status = 'reserved';
        $asset->reserved_by_order_id = $orderId;
        $asset->save();

        return $asset;
    }

    /**
     * Releases a reservation back to available — called when an order
     * expires or is cancelled before payment (Flows v1 Flow 4's
     * auto-expiry edge case). Must be idempotent: calling this on an
     * asset that's already 'sold' (payment confirmed before the expiry
     * job ran) must NOT silently un-sell it — that would be the same
     * class of race condition this method exists to prevent in the
     * first place.
     */
    public function releaseAsset(ProductAsset $asset): void
    {
        DB::transaction(function () use ($asset) {
            $lockedAsset = ProductAsset::query()->lockForUpdate()->findOrFail($asset->id);

            if ($lockedAsset->status !== 'reserved') {
                // Already sold (payment won the race against expiry) or
                // already available — either way, nothing to release.
                return;
            }

            $lockedAsset->status = 'available';
            $lockedAsset->reserved_by_order_id = null;
            $lockedAsset->save();
        });
    }

    /**
     * Marks a reserved asset as sold once payment is confirmed. Called
     * from OrderService::confirmPayment(), never standalone.
     */
    public function markAssetSold(ProductAsset $asset, int $orderId): void
    {
        $asset->status = 'sold';
        $asset->sold_to_order_id = $orderId;
        $asset->save();
    }

    /**
     * Flows v1 Flow 3 edge case: a limited-stock (non-asset-pool)
     * product's stock_count decrements per sale. Locks the product row
     * to prevent two concurrent sales from both reading the same
     * stock_count and both succeeding when only one unit remained.
     */
    public function decrementLimitedStock(Product $product): void
    {
        DB::transaction(function () use ($product) {
            $lockedProduct = Product::query()->lockForUpdate()->findOrFail($product->id);

            if ($lockedProduct->stock_mode !== 'limited') {
                throw new \LogicException('decrementLimitedStock() called on a non-limited-stock product.');
            }

            if ($lockedProduct->stock_count <= 0) {
                throw new \DomainException("Product {$product->id} is out of stock.");
            }

            $lockedProduct->stock_count -= 1;
            if ($lockedProduct->stock_count === 0) {
                $lockedProduct->status = 'out_of_stock';
            }
            $lockedProduct->save();
        });
    }
}
