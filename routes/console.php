<?php

use App\Console\Commands\CheckLedgerIntegrity;
use App\Console\Commands\ExpireStaleOrders;
use App\Console\Commands\GenerateDailyMetrics;
use App\Console\Commands\ReconcilePendingPayments;
use App\Console\Commands\ReconcileWalletBalances;
use App\Console\Commands\RemindPendingWithdrawals;
use App\Console\Commands\SweepExpiredDisputes;
use Illuminate\Support\Facades\Schedule;

/**
 * DannShop-Deploy-Rumahweb-Guide.md's Cron Job 1 (`schedule:run`,
 * every minute) is what actually triggers everything scheduled below
 * — these ->everyMinute() / ->everyFiveMinutes() / ->dailyAt() calls
 * define WHEN within that minute-level tick each command actually
 * fires; they do not themselves need separate cron entries.
 *
 * Frequency reasoning, money-critical first:
 *
 * - orders:expire-stale: every minute. Orders expire on a 45-minute
 *   window (OrderService::createOrder()) — checking every minute keeps
 *   reserved stock release prompt, not hours delayed.
 *
 * - payments:reconcile: every minute. Confirmed this session: for
 *   Duitku/iPaymu specifically, this may be the ONLY reliable
 *   confirmation path until their webhooks are battle-tested against
 *   real accounts — this is not a rare-fallback job, treat it as
 *   load-bearing.
 *
 * - ledger:check-integrity: every 5 minutes. This is detection, not a
 *   user-facing delay — running it on every single minute tick adds
 *   negligible value over 5-minute granularity at MVP transaction
 *   volume, while still catching a financial integrity violation fast
 *   enough to investigate same-day.
 *
 * - wallets:reconcile: once daily, late night (low-traffic window).
 *   Database Architecture v2 §7.2 itself specifies "reconciled at
 *   minimum nightly" — this is a full-table scan over every wallet's
 *   ledger sum, which is appropriate to run during low traffic rather
 *   than every few minutes at MVP scale.
 *
 * - disputes:sweep-expired: every 30 minutes. Dispute deadlines are
 *   measured in days (Flows v1 Flow 10), so sub-minute precision adds
 *   nothing — but frequent enough that a dispute doesn't sit
 *   unnecessarily long past its deadline before the status visibly
 *   updates for whoever's waiting.
 */
Schedule::command(ExpireStaleOrders::class)->everyMinute();
Schedule::command(ReconcilePendingPayments::class)->everyMinute();
Schedule::command(CheckLedgerIntegrity::class)->everyFiveMinutes();
Schedule::command(ReconcileWalletBalances::class)->dailyAt('02:00');
Schedule::command(GenerateDailyMetrics::class)->dailyAt('03:00');
Schedule::command(SweepExpiredDisputes::class)->everyThirtyMinutes();
Schedule::command(RemindPendingWithdrawals::class)->everySixHours();
