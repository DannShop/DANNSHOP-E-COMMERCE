<?php

namespace App\Domain\Store\Services;

use App\Domain\Store\Models\Store;
use App\Domain\Wallet\Models\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Flows v1 Flow 2 (Store Creation). createStore() creates the Wallet
 * row in the SAME transaction as the Store — a store without a wallet
 * is an invalid intermediate state this codebase should never produce,
 * even transiently.
 */
class StoreService
{
    /**
     * Flows v1 Flow 2, steps 1–5. Slug uniqueness is enforced at the DB
     * level (Database Architecture v2 §3.2's UNIQUE constraint) — this
     * method catches that and re-throws as a domain-specific exception
     * with a clear message, per Flows v1's "slug collision on submit"
     * edge case (advisory live-check passed, but someone else claimed
     * it in the race window before this INSERT).
     */
    public function createStore(int $userId, string $slug, string $name, ?string $bio = null): Store
    {
        $this->assertSlugAllowed($slug);

        return DB::transaction(function () use ($userId, $slug, $name, $bio) {
            try {
                $store = Store::create([
                    'user_id' => $userId,
                    'slug' => $slug,
                    'name' => $name,
                    'bio' => $bio,
                    'status' => 'active', // MVP auto-activates, no review gate at low seller volume (Architecture v1 §6.3)
                ]);
            } catch (\Illuminate\Database\QueryException $e) {
                if (str_contains($e->getMessage(), 'stores_slug_unique')) {
                    throw new \DomainException("The store URL '{$slug}' was just taken — please choose another.");
                }
                throw $e;
            }

            Wallet::create([
                'store_id' => $store->id,
                'cached_balance' => 0,
                'cached_available_balance' => 0,
                'cached_outstanding_debt' => 0,
            ]);

            return $store;
        });
    }

    /**
     * Updates non-slug store fields (name, bio, social_links). Kept
     * separate from changeSlug() deliberately — those two have very
     * different risk profiles: a bio typo fix should never be gated
     * behind a 30-day cooldown, only the slug (which shared links
     * depend on) needs that protection.
     */
    public function updateProfile(Store $store, array $attributes): Store
    {
        $allowed = array_intersect_key($attributes, array_flip(['name', 'bio', 'social_links']));
        $store->fill($allowed);
        $store->save();

        return $store;
    }

    /**
     * Flows v1 Flow 2's slug-change cooldown edge case: rate-limited to
     * once every 30 days, enforced here (Store::canChangeSlug() is the
     * read-only check the UI uses to show/hide the option; this method
     * is the actual enforcement point that cannot be bypassed by a
     * direct API call).
     */
    public function changeSlug(Store $store, string $newSlug): Store
    {
        if (! $store->canChangeSlug()) {
            throw new \DomainException('Store slug can only be changed once every 30 days.');
        }

        $this->assertSlugAllowed($newSlug);

        $store->slug = $newSlug;
        $store->slug_changed_at = now();
        $store->save();

        return $store;
    }

    /**
     * Flows v1 Flow 2's reserved/offensive slug edge case: a small
     * blocklist for the obvious squatting/impersonation cases. Full
     * content moderation is out of scope for MVP — this exists only to
     * block the cheapest, most obvious abuse, not to be comprehensive.
     */
    private function assertSlugAllowed(string $slug): void
    {
        $normalized = Str::lower($slug);

        $reserved = ['admin', 'dannshop', 'api', 'www', 'support', 'help', 'about', 'login', 'register'];

        if (in_array($normalized, $reserved, true)) {
            throw new \DomainException("'{$slug}' is a reserved name and cannot be used as a store URL.");
        }

        if (! preg_match('/^[a-z0-9\-]+$/', $normalized)) {
            throw new \DomainException('Store URL may only contain lowercase letters, numbers, and hyphens.');
        }
    }
}
