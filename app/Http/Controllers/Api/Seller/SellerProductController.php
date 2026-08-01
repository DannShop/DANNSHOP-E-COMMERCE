<?php

namespace App\Http\Controllers\Api\Seller;

use App\Domain\Product\DTOs\CreateProductData;
use App\Domain\Product\Models\Product;
use App\Domain\Product\Services\ProductService;
use App\Domain\Product\Services\ProductTypeMapper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Seller\CreateProductRequest;
use App\Http\Resources\ProductResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per Wildan's decision (this session, carried from a prior session):
 * sellers pick only product_type in the Add Product form — this
 * controller never accepts or forwards fulfillment_mode/stock_mode
 * from the request, enforcing that decision at the HTTP boundary too,
 * not just in CreateProductData's constructor shape.
 */
class SellerProductController extends Controller
{
    use ApiResponse;

    public function __construct(
        private ProductService $productService,
    ) {
    }

    /**
     * GET /api/seller/products/types
     * Powers the Add Product form's type selector — returns which
     * types are selectable vs. "coming soon" (topup_voucher/ppob,
     * disabled until product_provider_bindings has a real integration
     * — Database Architecture v2 §3.6). The frontend should render
     * unavailable types visibly but disabled, per the Gemini
     * instructions' "skeleton/empty states must be designed" principle
     * applied to a disabled-option state instead.
     */
    public function types(): JsonResponse
    {
        return $this->success(ProductTypeMapper::allTypes());
    }

    /**
     * GET /api/seller/products
     */
    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $products = Product::query()
            ->where('store_id', $store->id)
            ->with('category')
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return $this->success(ProductResource::collection($products));
    }

    /**
     * POST /api/seller/products
     * Creates as 'draft' (ProductService::createProduct()'s default) —
     * the seller must explicitly publish afterward (see publish()
     * below), which is where Flows v1 Flow 3's "zero stock at publish
     * time" guard actually runs.
     */
    public function store(CreateProductRequest $request): JsonResponse
    {
        $store = $request->user()->store;

        try {
            $product = $this->productService->createProduct(new CreateProductData(
                storeId: $store->id,
                name: $request->string('name'),
                productType: $request->string('product_type'),
                price: $request->integer('price'),
                categoryId: $request->integer('category_id') ?: null,
                description: $request->string('description') ?: null,
            ));
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new ProductResource($product), 201);
    }

    /**
     * POST /api/seller/products/{id}/publish
     * Separate from store() deliberately — Flows v1 Flow 3's publish-
     * time stock validation (no point publishing a license_pool product
     * with zero uploaded assets) only makes sense to run once the
     * seller has had a chance to upload assets after creating the
     * draft, not at creation time itself.
     */
    public function publish(Request $request, int $id): JsonResponse
    {
        $store = $request->user()->store;
        $product = Product::query()->where('id', $id)->where('store_id', $store->id)->first();

        if ($product === null) {
            return $this->error('Produk tidak ditemukan.', [], 404);
        }

        try {
            $product = $this->productService->publish($product);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new ProductResource($product));
    }
}
