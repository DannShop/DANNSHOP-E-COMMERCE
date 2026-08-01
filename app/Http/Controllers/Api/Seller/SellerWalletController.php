<?php

namespace App\Http\Controllers\Api\Seller;

use App\Http\Controllers\Controller;
use App\Http\Resources\WalletLedgerEntryResource;
use App\Http\Resources\WalletResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Architecture v1 §9.1: the seller dashboard's wallet view is the
 * single most retention-critical screen on the platform (the
 * "withdrawal anxiety" insight from Flows v1 Flow 2's user journey) —
 * this controller exists specifically to serve that screen fast and
 * unambiguously. All routes here require seller auth (see routes/api.php
 * middleware group) — a seller can only ever see their OWN wallet,
 * enforced via $request->user()->store->wallet, never an ID passed in
 * the URL that could be tampered with to view someone else's.
 */
class SellerWalletController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/seller/wallet
     */
    public function show(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        if ($store === null) {
            return $this->error('Anda belum memiliki toko.', [], 403);
        }

        return $this->success(new WalletResource($store->wallet));
    }

    /**
     * GET /api/seller/wallet/ledger
     * Database Architecture v2 §5's index strategy note: paginated,
     * never infinite-scroll, for financial records — keeps the ledger
     * auditable/referenceable by page rather than an unbounded stream.
     */
    public function ledger(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        if ($store === null) {
            return $this->error('Anda belum memiliki toko.', [], 403);
        }

        $entries = $store->wallet->ledgerEntries()
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return $this->success([
            'entries' => WalletLedgerEntryResource::collection($entries),
            'pagination' => [
                'current_page' => $entries->currentPage(),
                'last_page' => $entries->lastPage(),
                'total' => $entries->total(),
            ],
        ]);
    }
}
