<?php

namespace App\Domain\Payment\Gateways;

use App\Contracts\PaymentGatewayInterface;
use App\Domain\Payment\Models\PaymentProvider;

/**
 * Architecture v1 §8.2. Resolves which PaymentGatewayInterface
 * implementation is active by reading payment_providers, NOT from a
 * hardcoded config array — this is what makes provider switching an
 * admin-panel action instead of a deploy (Database Architecture v2
 * §3.14's rationale for why this is a table, not a config enum).
 *
 * MVP: exactly one active provider expected (Architecture v1 §8.2). The
 * resolve() method below deliberately throws if zero or more than one
 * are active, rather than silently picking one — an ambiguous "which
 * provider is active" state is exactly the kind of configuration bug
 * that should fail loudly at the point of use, not produce a
 * confusing wrong-provider payment attempt.
 *
 * PIVOT (this session): the old OkeConnect/OrderKuota/Qiospay-as-
 * payment-gateway lineup is replaced entirely. Wildan's decision: use
 * licensed PJP (Payment Services Provider) gateways instead — Midtrans,
 * Xendit, Duitku, iPaymu — resolving the Bank Indonesia regulatory
 * concern flagged in Database Architecture v2 §8.5. Qiospay is
 * retained, but reclassified: it is no longer a payment gateway here,
 * it becomes an H2H top-up/PPOB provider candidate under
 * product_provider_bindings (Database Architecture v2 §3.6) instead,
 * alongside DigiFlazz and similar — entirely separate from this
 * payment-gateway abstraction.
 *
 * Confidence level per gateway, stated honestly because it affects how
 * much you should trust each before a real transaction:
 * - Midtrans: HIGH — Wildan has an account, built from verified official docs.
 * - Xendit: MEDIUM — built from researched docs, no account to test against yet.
 * - Duitku: LOW — Duitku's own documentation is internally inconsistent
 *   about its signature scheme (see DuitkuGateway's docblock).
 * - iPaymu: LOW — signature scheme documented in a PDF not read in
 *   full this session (see IpaymuGateway's docblock); also requires
 *   KYC before QRIS activates, so there's an operational lead time
 *   beyond just the code being ready.
 */
class PaymentGatewayManager
{
    /**
     * @var array<string, class-string<PaymentGatewayInterface>>
     */
    private array $gatewayMap = [
        'midtrans' => MidtransGateway::class,
        'xendit' => XenditGateway::class,
        'duitku' => DuitkuGateway::class,
        'ipaymu' => IpaymuGateway::class,
        // 'qiospay' deliberately NOT mapped here — reclassified as an
        // H2H top-up/PPOB provider (product_provider_bindings), not a
        // payment gateway, per this session's research and Wildan's
        // decision. 'gopay' remains dropped entirely (prior session) —
        // a standard GoPay Merchant account has no official API.
    ];

    public function resolveActive(): PaymentGatewayInterface
    {
        $activeProviders = PaymentProvider::query()->active()->get();

        if ($activeProviders->isEmpty()) {
            throw new \RuntimeException('No active payment provider is configured. Checkout cannot proceed.');
        }

        if ($activeProviders->count() > 1) {
            // 🟡 V2 will support multiple simultaneously active providers
            // with explicit routing (Architecture v1 §8.2) — until that
            // routing logic exists, more than one active row is a
            // configuration error, not a valid multi-provider state.
            throw new \RuntimeException(
                'More than one payment provider is marked active. Multi-provider routing is not yet implemented — '.
                'exactly one provider must be active at a time in MVP.'
            );
        }

        return $this->resolve($activeProviders->first()->provider_key);
    }

    public function resolve(string $providerKey): PaymentGatewayInterface
    {
        $gatewayClass = $this->gatewayMap[$providerKey] ?? null;

        if ($gatewayClass === null) {
            throw new \RuntimeException("No PaymentGatewayInterface implementation registered for provider_key '{$providerKey}'.");
        }

        $provider = PaymentProvider::query()->where('provider_key', $providerKey)->firstOrFail();

        return new $gatewayClass($provider);
    }
}
