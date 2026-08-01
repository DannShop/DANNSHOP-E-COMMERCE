<?php

namespace App\Http\Controllers\Api\Seller;

use App\Domain\Wallet\Models\SellerPayoutMethod;
use App\Http\Controllers\Controller;
use App\Http\Requests\Seller\CreatePayoutMethodRequest;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Database Architecture v2 §3.2a: lets a seller save a reusable payout
 * method instead of re-entering bank details every withdrawal. Never
 * returns destination_details_encrypted in any response — same
 * principle as WithdrawalResource, this data is write-only via the API
 * once saved.
 */
class SellerPayoutMethodController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/seller/payout-methods
     */
    public function index(Request $request): JsonResponse
    {
        $store = $request->user()->store;

        $methods = SellerPayoutMethod::query()
            ->where('store_id', $store->id)
            ->orderBy('is_default', 'desc')
            ->get();

        return $this->success($methods->map(fn (SellerPayoutMethod $m) => [
            'id' => $m->id,
            'label' => $m->label,
            'destination_type' => $m->destination_type,
            'is_default' => $m->is_default,
        ]));
    }

    /**
     * POST /api/seller/payout-methods
     * account_number/account_holder_name/bank_or_provider_name are
     * combined into the encrypted JSON blob — never stored as separate
     * plaintext columns, consistent with Database Architecture v2
     * §3.2a's encryption requirement.
     */
    public function store(CreatePayoutMethodRequest $request): JsonResponse
    {
        $store = $request->user()->store;

        $details = [
            'account_number' => $request->string('account_number')->toString(),
            'account_holder_name' => $request->string('account_holder_name')->toString(),
            'bank_or_provider_name' => $request->string('bank_or_provider_name')->toString(),
        ];

        $method = SellerPayoutMethod::create([
            'store_id' => $store->id,
            'label' => $request->string('label'),
            'destination_type' => $request->string('destination_type'),
            'destination_details_encrypted' => json_encode($details),
            'encryption_key_version' => 1, // see ProductAsset.php's honest key-rotation caveat
            'is_default' => ! SellerPayoutMethod::query()->where('store_id', $store->id)->exists(), // first one becomes default automatically
        ]);

        return $this->success([
            'id' => $method->id,
            'label' => $method->label,
            'destination_type' => $method->destination_type,
            'is_default' => $method->is_default,
        ], 201);
    }
}
