<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates every /api/admin/* route. Uses User::isAdmin() — backed by the
 * dedicated is_admin column (this session's decision), never
 * role_hint, for the same reason EnsureUserIsSeller never reads
 * role_hint either: exactly one authoritative source of truth per
 * capability.
 */
class EnsureUserIsAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->isAdmin()) {
            return response()->json([
                'success' => false,
                'message' => 'Akses ditolak.',
            ], 403);
        }

        return $next($request);
    }
}
