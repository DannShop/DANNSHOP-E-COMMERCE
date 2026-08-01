/**
 * DannShop — Wallet Page JS
 * GET  /api/seller/wallet
 * GET  /api/seller/wallet/ledger
 * GET  /api/seller/payout-methods
 * POST /api/seller/payout-methods
 * POST /api/seller/withdrawals
 */

let cachedPayoutMethods = [];
let cachedAvailableBalance = 0;

function entryTypeLabel(type) {
  const labels = {
    credit_sale: 'Penjualan',
    debit_commission: 'Komisi Platform',
    debit_withdrawal: 'Penarikan Dana',
    credit_withdrawal_release: 'Pembatalan Penarikan',
    debit_refund_reversal: 'Refund ke Pembeli',
    credit_refund_release: 'Pembatalan Refund',
    debit_debt_recovery: 'Pemulihan Kewajiban Refund',
    adjustment: 'Penyesuaian Admin',
  };
  return labels[type] || type;
}

function renderWalletStats(wallet) {
  document.getElementById('wallet-stat-row').innerHTML = `
    <div class="stat-card primary-balance">
      <div class="label">Saldo Tersedia</div>
      <div class="value">${wallet.available_balance_formatted}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Saldo</div>
      <div class="value">${wallet.balance_formatted}</div>
    </div>
    <div class="stat-card">
      <div class="label">Kewajiban Refund</div>
      <div class="value" style="${wallet.has_outstanding_debt ? 'color: var(--color-danger-500);' : ''}">${wallet.outstanding_debt_formatted || 'Rp 0'}</div>
    </div>
  `;

  if (wallet.has_outstanding_debt) {
    document.getElementById('debt-warning-banner').innerHTML = `
      <div class="alert alert-warning">
        ⚠ Sebagian saldo Anda sedang dialokasikan untuk memenuhi kewajiban refund. Maksimal 50% dari tiap penjualan baru akan dipotong otomatis hingga lunas — sisanya tetap masuk ke saldo Anda.
      </div>
    `;
  }

  cachedAvailableBalance = wallet.available_balance;
}

function renderLedger(entries) {
  const container = document.getElementById('ledger-container');

  if (!entries || entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">💰</div>
        <div class="title">Belum ada transaksi</div>
        <div class="desc">Riwayat transaksi wallet Anda akan muncul di sini.</div>
      </div>
    `;
    return;
  }

  const rows = entries.map((entry) => `
    <tr>
      <td data-label="Jenis">${entryTypeLabel(entry.type)}</td>
      <td data-label="Jumlah" class="amount-cell" style="color:${entry.is_credit ? 'var(--color-success-500)' : 'var(--color-danger-500)'}">${entry.amount_formatted}</td>
      <td data-label="Saldo Setelah" class="amount-cell">${entry.balance_after_formatted}</td>
      <td data-label="Tanggal">${new Date(entry.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Jenis</th><th>Jumlah</th><th>Saldo Setelah</th><th>Tanggal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function loadPayoutMethods() {
  const res = await authFetch('/seller/payout-methods');
  const json = await res.json();
  cachedPayoutMethods = json.data || [];

  const select = document.getElementById('payout-method-select');
  const addSection = document.getElementById('add-payout-method-section');

  if (cachedPayoutMethods.length === 0) {
    select.innerHTML = '<option value="">Belum ada metode tersimpan</option>';
    addSection.style.display = 'block';
  } else {
    select.innerHTML = cachedPayoutMethods.map((m) =>
      `<option value="${m.id}">${escapeHtml(m.label)} (${m.destination_type === 'bank_transfer' ? 'Bank' : 'E-Wallet'})</option>`
    ).join('');
    addSection.style.display = 'none';
  }
}

function showWithdrawError(message) {
  document.getElementById('withdraw-form-error').innerHTML = `<div class="alert alert-danger">${escapeHtml(message)}</div>`;
}

function openModal() {
  document.getElementById('withdraw-modal').style.display = 'flex';
  document.getElementById('withdraw-form-error').innerHTML = '';
  loadPayoutMethods();
}

function closeModal() {
  document.getElementById('withdraw-modal').style.display = 'none';
}

async function init() {
  if (!requireAuth()) return;

  renderDashboardShell('wallet');

  try {
    const [walletRes, ledgerRes] = await Promise.all([
      authFetch('/seller/wallet'),
      authFetch('/seller/wallet/ledger'),
    ]);
    const wallet = (await walletRes.json()).data;
    const ledger = (await ledgerRes.json()).data;

    renderWalletStats(wallet);
    renderLedger(ledger.entries);
  } catch (err) {
    document.getElementById('ledger-container').innerHTML = `
      <div class="empty-state"><div class="icon">😕</div><div class="title">Gagal memuat data</div><div class="desc">${escapeHtml(err.message)}</div></div>
    `;
  }

  document.getElementById('open-withdraw-btn').addEventListener('click', openModal);
  document.getElementById('cancel-withdraw-btn').addEventListener('click', closeModal);

  document.getElementById('save-payout-method-btn').addEventListener('click', async () => {
    const label = document.getElementById('new-method-label').value.trim();
    const destinationType = document.getElementById('new-method-type').value;
    const provider = document.getElementById('new-method-provider').value.trim();
    const number = document.getElementById('new-method-number').value.trim();
    const holder = document.getElementById('new-method-holder').value.trim();

    if (!label || !provider || !number || !holder) {
      showWithdrawError('Lengkapi semua data metode pencairan.');
      return;
    }

    try {
      const res = await authFetch('/seller/payout-methods', {
        method: 'POST',
        body: JSON.stringify({
          label,
          destination_type: destinationType,
          bank_or_provider_name: provider,
          account_number: number,
          account_holder_name: holder,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        showWithdrawError(json.message || 'Gagal menyimpan metode pencairan.');
        return;
      }
      await loadPayoutMethods();
    } catch (err) {
      showWithdrawError(err.message);
    }
  });

  document.getElementById('withdraw-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = parseInt(document.getElementById('withdraw-amount').value, 10);
    const payoutMethodId = document.getElementById('payout-method-select').value;

    if (!payoutMethodId) {
      showWithdrawError('Pilih atau tambahkan metode pencairan terlebih dahulu.');
      return;
    }

    if (amount > cachedAvailableBalance) {
      showWithdrawError(`Jumlah melebihi saldo tersedia (${formatIDR(cachedAvailableBalance)}).`);
      return;
    }

    const submitBtn = document.getElementById('submit-withdraw-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Memproses...';

    try {
      const res = await authFetch('/seller/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ payout_method_id: payoutMethodId, amount_requested: amount }),
      });
      const json = await res.json();

      if (!json.success) {
        showWithdrawError(json.message || 'Gagal mengajukan penarikan.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Ajukan Penarikan';
        return;
      }

      closeModal();
      location.reload(); // simplest way to reflect the new reserved balance everywhere on the page
    } catch (err) {
      showWithdrawError('Tidak dapat terhubung ke server.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ajukan Penarikan';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
