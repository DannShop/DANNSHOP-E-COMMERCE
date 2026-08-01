<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates every /api/seller/* route. Uses User::isSeller() — the single
 * authoritative check derived from Store existence (Database
 * Architecture v2 §3.1) — never role_hint.
 */
class EnsureUserIsSeller
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->isSeller()) {
            return response()->json([
                'success' => false,
                'message' => 'Akses ditolak. Anda harus memiliki toko untuk mengakses halaman ini.',
            ], 403);
        }

        return $next($request);
    }
}
