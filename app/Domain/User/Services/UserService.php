<?php

namespace App\Domain\User\Services;

use App\Domain\User\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * Flows v1 Flow 1 (Registration) + Database Architecture v2 Security
 * finding #12's fix (failed_login_attempts / locked_until on users).
 */
class UserService
{
    private const MAX_FAILED_ATTEMPTS = 5;
    private const LOCKOUT_MINUTES = 15;

    /**
     * Flows v1 Flow 1, steps 1–3. Deliberately does NOT check whether
     * the email already exists and return a different error for that
     * case — per Flows v1's account-enumeration security note, the
     * caller (controller) is responsible for returning a generic
     * message regardless of whether the email was already registered.
     * This method simply attempts the insert and lets the DB's unique
     * constraint be the actual enforcement; the controller translates
     * that into a non-revealing response.
     */
    public function register(string $name, string $email, string $password, ?string $phone = null): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'password' => Hash::make($password),
            'role_hint' => 'buyer', // default hint only — see User::isSeller() for the actual capability check
        ]);
    }

    /**
     * Security finding #12's enforcement. Called from the login
     * controller AFTER a failed password check. Locks the account for
     * LOCKOUT_MINUTES once MAX_FAILED_ATTEMPTS is reached.
     */
    public function recordFailedLogin(User $user): void
    {
        $user->failed_login_attempts += 1;

        if ($user->failed_login_attempts >= self::MAX_FAILED_ATTEMPTS) {
            $user->locked_until = now()->addMinutes(self::LOCKOUT_MINUTES);
        }

        $user->save();
    }

    /**
     * Called from the login controller after a SUCCESSFUL password
     * check — resets the failed-attempt counter and clears any lock,
     * and records last_login_at for operational/security visibility.
     */
    public function recordSuccessfulLogin(User $user): void
    {
        $user->failed_login_attempts = 0;
        $user->locked_until = null;
        $user->last_login_at = now();
        $user->save();
    }
}
