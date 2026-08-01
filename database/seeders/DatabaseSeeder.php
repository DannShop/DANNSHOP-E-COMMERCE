<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Run via `php artisan db:seed`. Order matters: CommissionRuleSeeder
 * MUST run before any order can ever be created (OrderService::
 * createOrder() throws without an active global rule). PaymentProviderSeeder
 * and CategorySeeder have no interdependency with each other or with
 * commission rules, but are grouped here for one-command setup.
 *
 * This seeder deliberately does NOT create a Wildan user/admin account
 * or any seed Store/Product — those are real production data Wildan
 * creates himself through the actual registration flow + manual
 * is_admin=true flip (see SETUP-NOTES.md step 4), not seeded fake data
 * that would need cleanup before going live.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            CommissionRuleSeeder::class,
            PaymentProviderSeeder::class,
            CategorySeeder::class,
        ]);
    }
}
