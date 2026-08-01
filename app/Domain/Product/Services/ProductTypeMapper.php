<?php

namespace App\Domain\Product\Services;

/**
 * Per Wildan's decision (this session): sellers only pick a product_type
 * in the "Add Product" form — they never see or choose fulfillment_mode
 * or stock_mode directly. This class is the SINGLE source of truth for
 * that inference. If a new product_type is ever added, its mapping is
 * added here and nowhere else — ProductService::createProduct() and any
 * future admin tooling both read through this class rather than each
 * re-implementing the same if/else chain.
 *
 * provider_api / provider_managed (topup_voucher, ppob) are mapped
 * correctly here but the corresponding UI option should stay disabled
 * until product_provider_bindings has a real integration behind it
 * (Database Architecture v2 §3.6) — this class doesn't enforce that
 * disabling itself (that's a frontend/controller concern), it just
 * provides the correct mapping for when it's enabled.
 */
class ProductTypeMapper
{
    /**
     * @return array{fulfillment_mode: string, stock_mode: string}
     */
    public static function map(string $productType): array
    {
        return match ($productType) {
            'digital_file' => [
                'fulfillment_mode' => 'automatic',
                'stock_mode' => 'unlimited',
            ],
            'account_credential' => [
                'fulfillment_mode' => 'automatic',
                'stock_mode' => 'license_pool',
            ],
            'service' => [
                'fulfillment_mode' => 'manual',
                'stock_mode' => 'unlimited',
                // A service has no finite "stock" in the inventory
                // sense — stock_mode='unlimited' here just means "no
                // product_assets pool to deplete," not "infinite
                // simultaneous capacity." If a seller needs to cap how
                // many service orders they take at once, that's a
                // 🟡 V2 concept (e.g. a booking/slot system), not
                // something stock_mode is the right tool for in MVP.
            ],
            'topup_voucher', 'ppob' => [
                'fulfillment_mode' => 'provider_api',
                'stock_mode' => 'provider_managed',
            ],
            default => throw new \DomainException("Unknown product_type '{$productType}' — no fulfillment mapping defined."),
        };
    }

    /**
     * Whether this product_type is currently sellable end-to-end. False
     * for topup_voucher/ppob until a real provider_provider_bindings
     * integration exists — the controller/form should use this to
     * decide which options to show as selectable vs. visibly
     * "coming soon" in the Add Product UI.
     */
    public static function isAvailable(string $productType): bool
    {
        return ! in_array($productType, ['topup_voucher', 'ppob'], true);
    }

    /**
     * All product_types, paired with their availability — convenience
     * for building the Add Product form's options in one call rather
     * than the controller re-deriving this list itself.
     *
     * @return array<int, array{type: string, available: bool}>
     */
    public static function allTypes(): array
    {
        $types = ['digital_file', 'account_credential', 'service', 'topup_voucher', 'ppob'];

        return array_map(
            fn (string $type) => ['type' => $type, 'available' => self::isAvailable($type)],
            $types,
        );
    }
}
