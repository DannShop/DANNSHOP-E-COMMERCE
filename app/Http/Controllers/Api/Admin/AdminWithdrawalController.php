<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Withdrawal\Models\Withdrawal;
use App\Domain\Withdrawal\Services\WithdrawalService;
use App\Http\Controllers\Controller;
use App\Http\Resources\WithdrawalResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Flows v1 Flow 7. This is the queue Wildan (solo admin) operates daily
 * — Flows v1's own failure-scenario note flags this exact screen as
 * the highest operational risk for a solo founder: "a withdrawal
 * request that sits unanswered for a week will produce your worst
 * possible reviews." All routes require admin auth (routes/api.php).
 */
class AdminWithdrawalController extends Controller
{
    use ApiResponse;

    public function __construct(
        private WithdrawalService $withdrawalService,
    ) {
    }

    /**
     * GET /api/admin/withdrawals?status=pending
     * Defaults to 'pending' when no status filter is given — this is
     * the queue Wildan checks first thing, it should never require an
     * extra click to see what actually needs his attention today.
     */
    public function index(Request $request): JsonResponse
    {
        $status = $request->string('status')->toString() ?: 'pending';

        $withdrawals = Withdrawal::query()
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->with(['payoutMethod', 'store'])
            ->orderBy('created_at', 'asc') // oldest first — the ones waiting longest surface first, not buried by newer requests
            ->paginate(20);

        return $this->success(WithdrawalResource::collection($withdrawals));
    }

    /**
     * POST /api/admin/withdrawals/{id}/approve
     */
    public function approve(Request $request, int $id): JsonResponse
    {
        $withdrawal = Withdrawal::query()->findOrFail($id);

        try {
            $withdrawal = $this->withdrawalService->approveWithdrawal($withdrawal, $request->user()->id);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new WithdrawalResource($withdrawal));
    }

    /**
     * POST /api/admin/withdrawals/{id}/complete
     * Architecture v1 §7.3's explicit MVP decision: admin marks this
     * AFTER manually executing the real bank/e-wallet transfer outside
     * the system. This endpoint does not move any real money — it only
     * records that Wildan already did so manually.
     */
    public function complete(Request $request, int $id): JsonResponse
    {
        $withdrawal = Withdrawal::query()->findOrFail($id);

        try {
            $withdrawal = $this->withdrawalService->markCompleted($withdrawal);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new WithdrawalResource($withdrawal));
    }

    /**
     * POST /api/admin/withdrawals/{id}/reject
     * Body: { "reason": "...", "as_failed": false }
     * as_failed=true distinguishes "admin declined" from "transfer was
     * attempted but failed" (Flows v1 Flow 7 edge case) — both release
     * the reservation identically, but the audit trail differs.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => ['required', 'string']]);

        $withdrawal = Withdrawal::query()->findOrFail($id);

        try {
            $withdrawal = $this->withdrawalService->reject(
                $withdrawal,
                $request->user()->id,
                $request->string('reason'),
                $request->boolean('as_failed'),
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), [], 422);
        }

        return $this->success(new WithdrawalResource($withdrawal));
    }
}
