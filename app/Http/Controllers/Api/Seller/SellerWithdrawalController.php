<?php

namespace App\Http\Controllers\Api\Seller;

use App\Domain\Withdrawal\DTOs\RequestWithdrawalData;
use App\Domain\Withdrawal\Models\Withdrawal;
use App\Domain\Withdrawal\Services\WithdrawalService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Seller\RequestWithdrawalRequest;
use App\Http\Resources\WithdrawalResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Flows v1 Flow 7. fee_amount is computed here (a platform-config
 * concern, not something the seller submits) rather than trusted from
 * request input — a seller-submitted fee would be a direct path to
 * underpaying the platform's withdrawal fee. For MVP this is a flat
 * fee read from config; if it becomes a DB-configurable value later
 * (mirroring commission_rules' pattern), this is the one place that
 * lookup would change.
 */
class SellerWithdrawalController extends Controller
{
    use ApiResponse;

    private const FLAT_WITHDRAWAL_FEE = 2_500; // 🟡 placeholder MVP value — Wildan should confirm actual fee policy

    public function __construct(
        private WithdrawalService $withdrawalService,
    ) {
    }

    /**
     * POST /api/seller/withdrawals
     */
    public function store(RequestWithdrawalRequest $request): JsonResponse
    {
        $store = $request->user()->store;
        $wallet = $store->wallet;

        try {
            $withdrawal = $this->withdrawalService->requestWithdrawal(
                $wallet,
                new RequestWithdrawalData(
                    storeId: $store->id,
                    payoutMethodId: $request->integer('payout_method_id'),
                    amountRequested: $request->integer('amount_requested'),
                    feeAmount: self::FLAT_WITHDRAWAL_FEE,
                ),
            );
        } catch (\DomainException $e) {
            // Covers both "below minimum threshold" and "insufficient
            // available balance" (thrown from WalletService::
            // reserveWithdrawal()) — both are buyer/seller-facing
            // business rule violations, not server errors.
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new WithdrawalResource($withdrawal), 201);
    }

    /**
     * GET /api/seller/withdrawals
     */
    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $withdrawals = $store->wallet->withdrawals()
            ->with('payoutMethod')
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return $this->success(WithdrawalResource::collection($withdrawals));
    }

    /**
     * POST /api/seller/withdrawals/{id}/cancel
     * Flows v1 Flow 7 edge case: seller-initiated cancel, only valid
     * while status='pending'. Ownership check (the withdrawal must
     * belong to the requesting seller's own wallet) happens here before
     * any service call — never trust a numeric ID in a URL without
     * verifying the authenticated user actually owns the resource it
     * points to.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $store = $request->user()->store;
        $withdrawal = Withdrawal::query()->where('id', $id)->where('store_id', $store->id)->first();

        if ($withdrawal === null) {
            return $this->error('Penarikan dana tidak ditemukan.', [], 404);
        }

        try {
            $withdrawal = $this->withdrawalService->cancelBySeller($withdrawal);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new WithdrawalResource($withdrawal));
    }
}
