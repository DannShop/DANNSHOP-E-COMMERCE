<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Per Wildan's decision: 4 payment gateways (Midtrans, Xendit, Duitku,
 * iPaymu) exist as code, but admin activates exactly one at a time by
 * filling in that provider's specific credentials and toggling
 * is_active — never all four configured with real credentials
 * simultaneously unless genuinely about to use multi-provider routing
 * (not yet built, Architecture v1 §8.2).
 *
 * 'credentials' is validated as a generic array here rather than per-
 * provider-shape rules, because each gateway expects different keys
 * (Midtrans: server_key/client_key/is_production; Xendit: secret_key/
 * webhook_verification_token; Duitku: merchant_code/merchant_key;
 * iPaymu: api_key/va) — see each Gateway class's credentials() method
 * for the exact keys it reads. A stricter per-provider validation rule
 * set is a reasonable 🟡 V2 hardening item once Wildan has confirmed
 * each gateway's final field names against his own dashboards.
 */
class SetActiveProviderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // admin-only middleware already gates this route — see routes/api.php
    }

    public function rules(): array
    {
        return [
            'provider_key' => ['required', 'string', Rule::in(['midtrans', 'xendit', 'duitku', 'ipaymu'])],
            'credentials' => ['required', 'array'],
            'supports_dynamic_qris' => ['required', 'boolean'],
        ];
    }
}
