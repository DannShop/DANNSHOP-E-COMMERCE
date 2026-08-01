<?php

namespace Database\Seeders;

use App\Domain\Payment\Models\PaymentProvider;
use Illuminate\Database\Seeder;

/**
 * Seeds the 4 payment gateway rows (Midtrans, Xendit, Duitku, iPaymu)
 * with NO credentials and is_active=false — this seeder deliberately
 * does NOT activate any provider or insert real API keys, since those
 * are secrets that belong to Wildan, never hardcoded in a seeder file
 * that might end up in version control.
 *
 * After seeding, Wildan activates exactly one provider via
 * POST /api/admin/payment-providers/activate (AdminPaymentProviderController),
 * supplying real credentials through that authenticated endpoint —
 * never by editing this seeder with real keys.
 *
 * credentials_encrypted is seeded as an empty JSON object rather than
 * NULL, since the column is NOT NULL per Database Architecture v2
 * §3.14 — it gets overwritten with real data the moment the provider
 * is activated.
 */
class PaymentProviderSeeder extends Seeder
{
    public function run(): void
    {
        $providers = [
            [
                'provider_key' => 'midtrans',
                'display_name' => 'Midtrans',
                'supports_dynamic_qris' => true, // confirmed via research this session
            ],
            [
                'provider_key' => 'xendit',
                'display_name' => 'Xendit',
                'supports_dynamic_qris' => true, // confirmed via research this session
            ],
            [
                'provider_key' => 'duitku',
                'display_name' => 'Duitku',
                'supports_dynamic_qris' => true, // confirmed dynamic in principle, but see DuitkuGateway's signature-scheme caveat
            ],
            [
                'provider_key' => 'ipaymu',
                'display_name' => 'iPaymu',
                'supports_dynamic_qris' => true, // confirmed dynamic, but requires KYC before activation works in practice
            ],
        ];

        foreach ($providers as $provider) {
            PaymentProvider::query()->firstOrCreate(
                ['provider_key' => $provider['provider_key']],
                [
                    'display_name' => $provider['display_name'],
                    'is_active' => false, // NEVER seed as active — Wildan activates explicitly with real credentials
                    'supports_dynamic_qris' => $provider['supports_dynamic_qris'],
                    'credentials_encrypted' => json_encode([]),
                    'encryption_key_version' => 1,
                    'priority' => 0,
                ],
            );
        }
    }
}
