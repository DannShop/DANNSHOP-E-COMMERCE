<?php

namespace App\Http\Controllers\Api\Seller;

use App\Domain\Store\Services\StoreService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Seller\ChangeSlugRequest;
use App\Http\Requests\Seller\CreateStoreRequest;
use App\Http\Requests\Seller\UpdateStoreProfileRequest;
use App\Http\Resources\StoreResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Flows v1 Flow 2. Powers the seller Settings page — separate from
 * StorefrontController (which is the PUBLIC, buyer-facing read-only
 * view of a store) since a seller viewing/editing their own store has
 * different needs (sees it regardless of active/suspended status,
 * can mutate it) than a buyer browsing it.
 */
class SellerStoreController extends Controller
{
    use ApiResponse;

    public function __construct(
        private StoreService $storeService,
    ) {
    }

    /**
     * POST /api/create-store
     * Deliberately NOT under the /seller/* prefix or 'seller'
     * middleware — this is the endpoint that TURNS a plain authenticated
     * user INTO a seller (per User::isSeller()'s Store-existence
     * check), so gating it behind "must already be a seller" would be
     * a contradiction. Only requires auth:sanctum. Rejects if the user
     * already has a store, since Database Architecture v2 §3.2
     * enforces one store per user for now.
     */
    public function store(CreateStoreRequest $request): JsonResponse
    {
        $user = $request->user();

        if ($user->isSeller()) {
            return $this->error('Anda sudah memiliki toko.', [], 422);
        }

        try {
            $store = $this->storeService->createStore(
                $user->id,
                $request->string('slug'),
                $request->string('name'),
                $request->string('bio') ?: null,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new StoreResource($store), 201);
    }

    /**
     * GET /api/seller/store
     */
    public function show(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        if ($store === null) {
            return $this->error('Anda belum memiliki toko.', [], 403);
        }

        return $this->success(array_merge(
            (new StoreResource($store))->toArray($request),
            ['slug' => $store->slug, 'can_change_slug' => $store->canChangeSlug()],
        ));
    }

    /**
     * PATCH /api/seller/store
     */
    public function update(UpdateStoreProfileRequest $request): JsonResponse
    {
        $store = $request->user()->store;

        $updated = $this->storeService->updateProfile($store, $request->only(['name', 'bio', 'social_links']));

        return $this->success(new StoreResource($updated));
    }

    /**
     * POST /api/seller/store/change-slug
     * Flows v1 Flow 2's 30-day cooldown — enforced in StoreService,
     * this controller just translates the resulting exception into a
     * clear API error.
     */
    public function changeSlug(ChangeSlugRequest $request): JsonResponse
    {
        $store = $request->user()->store;

        try {
            $updated = $this->storeService->changeSlug($store, $request->string('slug'));
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(['slug' => $updated->slug]);
    }
}
