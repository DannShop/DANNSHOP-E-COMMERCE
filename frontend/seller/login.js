/**
 * DannShop — Login JS
 * POST /api/login → AuthController::login
 *
 * Handles the 423 (Locked) status specifically — Database Architecture
 * v2 Security finding #12's account lockout returns this distinct
 * status, and the UI should show a clear "account temporarily locked"
 * message, not a generic "wrong password" one (the backend already
 * deliberately does NOT reveal whether the lock vs wrong-password case
 * applies if the account is already locked — see AuthController's
 * comment — but once 423 is the actual response, showing it plainly
 * here isn't an enumeration risk, it's just honest feedback for an
 * already-known account state).
 */

function setLoginLoading(isLoading) {
  const btn = document.getElementById('submit-button');
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.innerHTML = '<span class="spinner"></span> Memproses...';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || 'Masuk';
    btn.disabled = false;
  }
}

function showBanner(message, type = 'danger') {
  document.getElementById('form-error-banner').innerHTML = `
    <div class="alert alert-${type}">${escapeHtml(message)}</div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, skip straight to dashboard rather than
  // showing the login form again.
  if (getToken()) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    setLoginLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();

      if (!json.success) {
        if (res.status === 423) {
          showBanner('Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.', 'warning');
        } else {
          showBanner(json.message || 'Email atau password salah.');
        }
        setLoginLoading(false);
        return;
      }

      setSession(json.data.token, json.data.user);

      if (!json.data.user.is_seller) {
        // Logged in successfully, but this account has no Store yet —
        // per User::isSeller() being the single authoritative check.
        // Send to onboarding rather than a dashboard that has nothing
        // to show.
        window.location.href = 'onboarding.html';
        return;
      }

      window.location.href = 'dashboard.html';
    } catch (err) {
      showBanner('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.');
      setLoginLoading(false);
    }
  });
});
