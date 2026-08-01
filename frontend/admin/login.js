/**
 * DannShop — Admin Login JS
 * POST /api/login → AuthController::login (same endpoint as seller
 * login — is_admin is checked server-side by the 'admin' middleware
 * on every subsequent /api/admin/* request, not at login time itself,
 * since login succeeding just proves identity, not authorization).
 */

function setLoginLoading(isLoading) {
  const btn = document.getElementById('submit-button');
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span> Memproses...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || 'Masuk';
    btn.disabled = false;
  }
}

function showBanner(message, type = 'danger') {
  document.getElementById('form-error-banner').innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    window.location.href = 'withdrawals.html';
    return;
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('email').value.trim(),
          password: document.getElementById('password').value,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        showBanner(res.status === 423 ? 'Akun terkunci sementara. Coba lagi dalam 15 menit.' : (json.message || 'Email atau password salah.'));
        setLoginLoading(false);
        return;
      }

      setSession(json.data.token, json.data.user);

      const verifyRes = await fetch(`${API_BASE_URL}/admin/withdrawals`, {
        headers: { 'Authorization': `Bearer ${json.data.token}` },
      });

      if (verifyRes.status === 403) {
        clearSession();
        showBanner('Akun ini tidak memiliki akses admin.');
        setLoginLoading(false);
        return;
      }

      window.location.href = 'withdrawals.html';
    } catch (err) {
      showBanner('Tidak dapat terhubung ke server.');
      setLoginLoading(false);
    }
  });
});
