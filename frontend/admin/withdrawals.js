/**
 * DannShop — Admin Withdrawal Queue JS
 * GET  /api/admin/withdrawals?status=X
 * POST /api/admin/withdrawals/{id}/approve
 * POST /api/admin/withdrawals/{id}/complete
 * POST /api/admin/withdrawals/{id}/reject
 *
 * Reflects WithdrawalService's exact state machine (Database
 * Architecture v2 §8.1): pending → [approve] → processing →
 * [complete, AFTER Wildan manually executes the real transfer] →
 * completed. Reject is available from pending or processing.
 */

let currentStatus = 'pending';
let pendingRejectId = null;

function statusLabel(status) {
  const labels = {
    pending: 'Menunggu Review', approved: 'Disetujui', processing: 'Diproses',
    completed: 'Selesai', rejected: 'Ditolak', failed: 'Gagal', cancelled: 'Dibatalkan',
  };
  return labels[status] || status;
}

function badgeClass(status) {
  const map = { pending: 'pending', processing: 'processing', completed: 'completed', rejected: 'rejected', failed: 'failed', cancelled: 'cancelled', approved: 'approved' };
  return map[status] || 'pending';
}

function renderActionButtons(w) {
  if (w.status === 'pending') {
    return `
      <div class="action-btn-group">
        <button class="approve-btn" data-id="${w.id}" data-action="approve">Setujui</button>
        <button class="reject-btn" data-id="${w.id}" data-action="reject">Tolak</button>
      </div>
    `;
  }
  if (w.status === 'processing') {
    return `
      <div class="action-btn-group">
        <button class="complete-btn" data-id="${w.id}" data-action="complete">Tandai Selesai</button>
        <button class="reject-btn" data-id="${w.id}" data-action="reject-failed">Gagal Transfer</button>
      </div>
    `;
  }
  return '-';
}

function renderWithdrawals(withdrawals) {
  const container = document.getElementById('withdrawals-container');

  if (!withdrawals || withdrawals.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">✅</div>
        <div class="title">Tidak ada penarikan di kategori ini</div>
        <div class="desc">Semua permintaan penarikan sudah ditangani.</div>
      </div>
    `;
    return;
  }

  const rows = withdrawals.map((w) => `
    <tr>
      <td data-label="Jumlah" class="amount-cell">${w.amount_payable_formatted}</td>
      <td data-label="Metode">${escapeHtml(w.payout_method?.label || '-')}</td>
      <td data-label="Status"><span class="status-badge ${badgeClass(w.status)}">${statusLabel(w.status)}</span></td>
      <td data-label="Diajukan">${new Date(w.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td data-label="Aksi">${renderActionButtons(w)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table compact">
      <thead><tr><th>Jumlah</th><th>Metode</th><th>Status</th><th>Diajukan</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.querySelectorAll('[data-action="approve"]').forEach((btn) => btn.addEventListener('click', () => handleApprove(btn.dataset.id)));
  document.querySelectorAll('[data-action="complete"]').forEach((btn) => btn.addEventListener('click', () => handleComplete(btn.dataset.id)));
  document.querySelectorAll('[data-action="reject"]').forEach((btn) => btn.addEventListener('click', () => openRejectModal(btn.dataset.id, false)));
  document.querySelectorAll('[data-action="reject-failed"]').forEach((btn) => btn.addEventListener('click', () => openRejectModal(btn.dataset.id, true)));
}

async function loadWithdrawals() {
  try {
    const res = await authFetch(`/admin/withdrawals?status=${currentStatus}`);
    const json = await res.json();
    renderWithdrawals(json.data);
  } catch (err) {
    document.getElementById('withdrawals-container').innerHTML = `
      <div class="empty-state"><div class="icon">😕</div><div class="title">Gagal memuat data</div><div class="desc">${escapeHtml(err.message)}</div></div>
    `;
  }
}

async function handleApprove(id) {
  if (!confirm('Setujui permintaan penarikan ini? Anda akan perlu melakukan transfer manual setelah ini.')) return;
  try {
    const res = await authFetch(`/admin/withdrawals/${id}/approve`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    await loadWithdrawals();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function handleComplete(id) {
  if (!confirm('Konfirmasi: Anda SUDAH melakukan transfer manual ke rekening seller untuk penarikan ini?')) return;
  try {
    const res = await authFetch(`/admin/withdrawals/${id}/complete`, { method: 'POST' });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    await loadWithdrawals();
  } catch (err) { alert('Gagal: ' + err.message); }
}

function openRejectModal(id, asFailed) {
  pendingRejectId = { id, asFailed };
  document.getElementById('reject-modal').style.display = 'flex';
  document.getElementById('reject-reason').value = '';
}

function closeRejectModal() {
  document.getElementById('reject-modal').style.display = 'none';
  pendingRejectId = null;
}

async function confirmReject() {
  const reason = document.getElementById('reject-reason').value.trim();
  if (!reason) { alert('Alasan wajib diisi.'); return; }

  try {
    const res = await authFetch(`/admin/withdrawals/${pendingRejectId.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, as_failed: pendingRejectId.asFailed }),
    });
    const json = await res.json();
    if (!json.success) { alert(json.message); return; }
    closeRejectModal();
    await loadWithdrawals();
  } catch (err) {
    alert('Gagal: ' + err.message);
  }
}

async function init() {
  if (!requireAuth()) return;

  renderAdminShell('withdrawals');
  await loadWithdrawals();

  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentStatus = tab.dataset.status;
      document.getElementById('withdrawals-container').innerHTML = '<div class="skeleton-block" style="height:300px;"></div>';
      await loadWithdrawals();
    });
  });

  document.getElementById('cancel-reject-btn').addEventListener('click', closeRejectModal);
  document.getElementById('confirm-reject-btn').addEventListener('click', confirmReject);
}

document.addEventListener('DOMContentLoaded', init);
