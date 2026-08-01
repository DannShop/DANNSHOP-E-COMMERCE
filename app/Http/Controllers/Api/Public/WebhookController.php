<?php

namespace App\Http\Controllers\Api\Public;

use App\Domain\Payment\Services\PaymentService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Architecture v1 §8.4: this is the single most security-critical
 * endpoint in the entire platform, since it directly triggers wallet
 * credits via PaymentService::handleWebhook() → OrderService::
 * confirmPayment() → WalletService::recordSale(). Signature
 * verification happens INSIDE PaymentService::handleWebhook() (it
 * resolves the correct gateway and calls that gateway's own
 * verifyWebhookSignature()) — this controller does not, and must not,
 * attempt its own verification, since the scheme differs per provider
 * and only the resolved Gateway instance knows which one applies.
 *
 * No auth middleware on this route — webhooks come from the payment
 * provider's servers, not from a logged-in user, and providers cannot
 * present a DannShop session token. Trust is established entirely via
 * the per-provider signature check, not via Laravel's normal auth.
 */
class WebhookController extends Controller
{
    public function __construct(
        private PaymentService $paymentService,
    ) {
    }

    /**
     * POST /api/webhooks/{provider}
     * {provider} matches payment_providers.provider_key (e.g.
     * 'midtrans', 'xendit') — this is how a single route handles every
     * gateway without provider-specific route definitions, consistent
     * with the PaymentGatewayInterface abstraction never being bypassed.
     *
     * Always returns 200 on success, per Midtrans's own documented
     * expectation (and the general webhook convention): the provider
     * should not retry an already-handled notification. On failure, we
     * return a non-200 deliberately, since some providers (confirmed
     * for Midtrans) will retry on non-200, which is desirable for a
     * transient failure but should never happen for "invalid signature"
     * specifically, since retrying a forged request gains nothing.
     */
    public function handle(string $provider, Request $request): JsonResponse
    {
        try {
            $this->paymentService->handleWebhook($provider, $request);
        } catch (\RuntimeException $e) {
            Log::error('Webhook handling failed.', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['success' => false], 400);
        }

        return response()->json(['success' => true], 200);
    }
}
