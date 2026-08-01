<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Payment\Models\PaymentProvider;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SetActiveProviderRequest;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Architecture v1 §8.2 + Database Architecture v2 §3.14: this is the
 * concrete admin-panel realization of "switching providers requires no
 * source code changes." Wildan picks which of Midtrans/Xendit/Duitku/
 * iPaymu is active here, fills in that provider's credentials, and the
 * checkout flow picks it up immediately via PaymentGatewayManager —
 * with zero deploys.
 *
 * Never returns credentials_encrypted in any response, even to the
 * admin who set it — once saved, it is write-only via this API
 * surface. If Wildan needs to verify what's stored, that's a direct
 * database/dashboard lookup, not an API response, consistent with how
 * seller_payout_methods' destination_details_encrypted is handled in
 * WithdrawalResource.
 */
class AdminPaymentProviderController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/admin/payment-providers
     */
    public function index(): JsonResponse
    {
        $providers = PaymentProvider::query()->get();

        return $this->success($providers->map(fn (PaymentProvider $p) => [
            'id' => $p->id,
            'provider_key' => $p->provider_key,
            'display_name' => $p->display_name,
            'is_active' => $p->is_active,
            'supports_dynamic_qris' => $p->supports_dynamic_qris,
            'has_credentials' => $p->credentials_encrypted !== null,
        ]));
    }

    /**
     * POST /api/admin/payment-providers/activate
     * Atomically deactivates every other provider and activates the
     * named one — enforces Architecture v1 §8.2's "exactly one active
     * provider" rule at the point of write, not just relying on
     * PaymentGatewayManager::resolveActive() to catch a violation
     * later at checkout time (better to prevent the bad state than
     * detect it after the fact).
     */
    public function activate(SetActiveProviderRequest $request): JsonResponse
    {
        $providerKey = $request->string('provider_key')->toString();

        $provider = DB::transaction(function () use ($request, $providerKey) {
            PaymentProvider::query()->where('is_active', true)->update(['is_active' => false]);

            $provider = PaymentProvider::query()->where('provider_key', $providerKey)->first();

            $attributes = [
                'is_active' => true,
                'supports_dynamic_qris' => $request->boolean('supports_dynamic_qris'),
                'credentials_encrypted' => json_encode($request->input('credentials')),
                'encryption_key_version' => 1, // see ProductAsset.php's honest caveat re: Laravel's encrypted cast not yet supporting true key rotation
            ];

            if ($provider) {
                $provider->update($attributes);
            } else {
                $provider = PaymentProvider::create([
                    'provider_key' => $providerKey,
                    'display_name' => ucfirst($providerKey),
                    ...$attributes,
                ]);
            }

            return $provider;
        });

        return $this->success([
            'provider_key' => $provider->provider_key,
            'is_active' => $provider->is_active,
        ]);
    }

    /**
     * POST /api/admin/payment-providers/deactivate
     * Leaves checkout with zero active providers — PaymentGatewayManager
     * ::resolveActive() will throw clearly at the next checkout attempt
     * rather than silently falling back to anything. Useful for
     * deliberately pausing checkout (e.g. during a credential rotation).
     */
    public function deactivate(): JsonResponse
    {
        PaymentProvider::query()->where('is_active', true)->update(['is_active' => false]);

        return $this->success(['message' => 'Semua payment provider dinonaktifkan.']);
    }
}
