<?php

namespace App\Http\Controllers\Api\Public;

use App\Domain\User\Models\User;
use App\Domain\User\Services\UserService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * Flows v1 Flow 1 (Registration) + Database Architecture v2 Security
 * finding #12 (account lockout, enforced via UserService).
 *
 * Uses Laravel Sanctum's personal access tokens (token-based, not
 * session cookies) per the architecture pivot this session: frontend
 * is now a fully separate consumer (potentially even a different
 * domain/repo eventually), so a Bearer token is the right auth
 * mechanism, matching exactly what the Gemini instructions document
 * already specifies (Authorization: Bearer <token>, stored in
 * localStorage by the frontend).
 */
class AuthController extends Controller
{
    use ApiResponse;

    public function __construct(
        private UserService $userService,
    ) {
    }

    /**
     * POST /api/register
     * Flows v1 Flow 1's account-enumeration security note: the unique
     * email constraint still runs (we don't want duplicate accounts),
     * but a collision is reported with the SAME generic message used
     * for unrelated validation failures, never a distinct "email
     * already taken" message that confirms an account exists.
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        if (User::query()->where('email', $request->string('email'))->exists()) {
            // Deliberately generic and deliberately the SAME shape as a
            // genuine success path's next step would suggest — per
            // Flows v1 Flow 1: "If this email is registered, check your
            // inbox, or try logging in / resetting your password."
            return $this->success([
                'message' => 'Jika email ini valid, silakan periksa kotak masuk Anda atau coba masuk dengan email tersebut.',
            ]);
        }

        $user = $this->userService->register(
            $request->string('name'),
            $request->string('email'),
            $request->string('password'),
            $request->string('phone') ?: null,
        );

        $token = $user->createToken('dannshop-frontend')->plainTextToken;

        return $this->success([
            'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email],
            'token' => $token,
        ], 201);
    }

    /**
     * POST /api/login
     * Security finding #12: checks lockout BEFORE attempting password
     * verification — a locked account returns the lockout message
     * regardless of whether the submitted password would have been
     * correct, since revealing "actually your password WAS right, you're
     * just locked out" leaks information an attacker could use.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->string('email'))->first();

        if ($user === null) {
            return $this->error('Email atau password salah.', [], 401);
        }

        if ($user->isLocked()) {
            return $this->error('Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.', [], 423);
        }

        if (! Hash::check($request->string('password'), $user->password)) {
            $this->userService->recordFailedLogin($user);

            return $this->error('Email atau password salah.', [], 401);
        }

        $this->userService->recordSuccessfulLogin($user);

        $token = $user->createToken('dannshop-frontend')->plainTextToken;

        return $this->success([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_seller' => $user->isSeller(),
            ],
            'token' => $token,
        ]);
    }

    /**
     * POST /api/logout
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->success(['message' => 'Berhasil keluar.']);
    }
}
