/**
 * DannShop — Admin Payment Provider Config JS
 * GET  /api/admin/payment-providers
 * POST /api/admin/payment-providers/activate
 * POST /api/admin/payment-providers/deactivate
 *
 * CREDENTIAL_FIELDS below are verified directly against each Gateway
 * class's credentials() reads this session — MidtransGateway reads
 * 'server_key', XenditGateway reads 'secret_key'/
 * 'webhook_verification_token', DuitkuGateway reads 'merchant_code'/
 * 'merchant_key', IpaymuGateway reads 'va'/'api_key'. These field
 * names must stay in sync with those classes — if a Gateway's
 * credentials() method changes, update the matching entry here too.
 */

const PROVIDER_LABELS = { midtrans: 'Midtrans', xendit: 'Xendit', duitku: 'Duitku', ipaymu: 'iPaymu' };

const CREDENTIAL_FIELDS = {
  midtrans: [
    { key: 'server_key', label: 'Server Key', placeholder: 'SB-Mid-server-xxxxxxxxxxxxx' },
  ],
  xendit: [
    { key: 'secret_key', label: 'Secret Key', placeholder: 'xnd_development_xxxxxxxxxxxxx' },
    { key: 'webhook_verification_token', label: 'Webhook Verification Token', placeholder: 'dari Dashboard > Settings > Developers > Webhooks' },
  ],
  duitku: [
    { key: 'merchant_code', label: 'Merchant Code', placeholder: 'DXXXX' },
    { key: 'merchant_key', label: 'Merchant Key', placeholder: '' },
  ],
  ipaymu: [
    { key: 'va', label: 'Virtual Account (VA)', placeholder: '' },
    { key: 'api_key', label: 'API Key', placeholder: '' },
  ],
};

let activeCredentialProviderKey = null;

function renderProviders(providers) {
  const container = document.getElementById('providers-container');

  const rows = providers.map((p) => `
    <tr>
      <td data-label="Provider" style="font-weight:600;">${PROVIDER_LABELS[p.provider_key] || p.provider_key}</td>
      <td data-label="Status">
        ${p.is_active
          ? '<span class="status-badge completed">Aktif</span>'
          : '<span class="status-badge cancelled">Nonaktif</span>'}
      </td>
      <td data-label="Kredensial">${p.has_credentials ? '✓ Tersimpan' : '— Belum diisi'}</td>
      <td data-label="Aksi">
        ${p.is_active
          ? `<button class="reject-btn deactivate-btn" data-key="${p.provider_key}" style="height:30px; padding:0 10px; font-size:12px; border-radius:6px; background:white; color:var(--color-danger-500); border:1px solid var(--color-danger-500); cursor:pointer;">Nonaktifkan</button>`
          : `<button class="approve-btn activate-btn" data-key="${p.provider_key}" style="height:30px; padding:0 10px; font-size:12px; border-radius:6px; background:var(--color-primary-500); color:white; border:none; cursor:pointer;">Aktifkan</button>`}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Provider</th><th>Status</th><th>Kredensial</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.querySelectorAll('.activate-btn').forEach((btn) => btn.addEventListener('click', () => openCredentialModal(btn.dataset.key)));
  document.querySelectorAll('.deactivate-btn').forEach((btn) => btn.addEventListener('click', () => handleDeactivate()));
}

async function loadProviders() {
  try {
    const res = await authFetch('/admin/payment-providers');
    const json = await res.json();
    renderProviders(json.data);
  } catch (err) {
    document.getElementById('providers-container').innerHTML = `
      <div class="empty-state"><div class="icon">😕</div><div class="title">Gagal memuat data</div><div class="desc">${escapeHtml(err.message)}</div></div>
    `;
  }
}

function openCredentialModal(providerKey) {
  activeCredentialProviderKey = providerKey;
  document.getElementById('credential-modal-title').textContent = `Aktifkan ${PROVIDER_LABELS[providerKey]}`;
  document.getElementById('credential-form-error').innerHTML = '';

  const fields = CREDENTIAL_FIELDS[providerKey] || [];
  document.getElementById('credential-fields').innerHTML = fields.map((f) => `
    <div class="form-group">
      <label class="form-label">${f.label}</label>
      <input type="text" class="form-input cred-input" data-key="${f.key}" placeholder="${f.placeholder}">
    </div>
  `).join('');

  document.getElementById('credential-modal').style.display = 'flex';
}

function closeCredentialModal() {
  document.getElementById('credential-modal').style.display = 'none';
  activeCredentialProviderKey = null;
}

async function handleActivateSubmit() {
  const credentials = {};
  let hasEmpty = false;

  document.querySelectorAll('.cred-input').forEach((input) => {
    if (!input.value.trim()) hasEmpty = true;
    credentials[input.dataset.key] = input.value.trim();
  });

  if (hasEmpty) {
    document.getElementById('credential-form-error').innerHTML = `<div class="alert alert-danger">Lengkapi semua field kredensial.</div>`;
    return;
  }

  const btn = document.getElementById('save-credential-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Mengaktifkan...';

  try {
    const res = await authFetch('/admin/payment-providers/activate', {
      method: 'POST',
      body: JSON.stringify({
        provider_key: activeCredentialProviderKey,
        supports_dynamic_qris: true,
        credentials: { ...credentials, is_production: document.getElementById('cred-is-production').checked },
      }),
    });
    const json = await res.json();

    if (!json.success) {
      document.getElementById('credential-form-error').innerHTML = `<div class="alert alert-danger">${escapeHtml(json.message || 'Gagal mengaktifkan provider.')}</div>`;
      btn.disabled = false;
      btn.textContent = 'Aktifkan';
      return;
    }

    closeCredentialModal();
    await loadProviders();
  } catch (err) {
    document.getElementById('credential-form-error').innerHTML = `<div class="alert alert-danger">Tidak dapat terhubung ke server.</div>`;
    btn.disabled = false;
    btn.textContent = 'Aktifkan';
  }
}

async function handleDeactivate() {
  if (!confirm('Nonaktifkan provider ini? Checkout akan tidak berfungsi sampai provider lain diaktifkan.')) return;
  try {
    await authFetch('/admin/payment-providers/deactivate', { method: 'POST' });
    await loadProviders();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function init() {
  if (!requireAuth()) return;

  renderAdminShell('providers');
  await loadProviders();

  document.getElementById('cancel-credential-btn').addEventListener('click', closeCredentialModal);
  document.getElementById('save-credential-btn').addEventListener('click', handleActivateSubmit);
}

document.addEventListener('DOMContentLoaded', init);
