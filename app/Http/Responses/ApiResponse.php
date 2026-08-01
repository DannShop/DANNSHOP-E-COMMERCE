<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;

/**
 * Implements the exact response contract documented in
 * DannShop-Gemini-Instructions.md §4 — every API controller uses this
 * trait so the frontend (built by Gemini) can rely on a single,
 * consistent shape across all endpoints without per-endpoint special
 * cases. This is the concrete enforcement point for that contract:
 * if a controller bypasses this and returns a raw response()->json(),
 * that is a bug, not a style choice.
 */
trait ApiResponse
{
    protected function success(mixed $data = null, int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
        ], $status);
    }

    protected function error(string $message, array $errors = [], int $status = 422): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $message,
            'errors' => $errors,
        ], $status);
    }
}
