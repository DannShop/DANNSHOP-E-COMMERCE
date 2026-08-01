/**
 * DannShop — Admin Auth Helper
 * Mirrors seller/auth.js but scoped to /admin/* — kept as a SEPARATE
 * file (not shared with seller/auth.js) deliberately: an admin
 * session and a seller session should never be confused or
 * interchangeable, even though Wildan may hold both roles on the same
 * underlying User account. Using distinct token storage keys prevents
 * a scenario where being logged in as admin in one tab silently also
 * grants seller UI access in another, or vice versa.
 */
const API_BASE_URL = 'http://127.0.0.1:8000/api';
const TOKEN_KEY = 'dannshop_admin_token';
const USER_KEY = 'dannshop_admin_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`,
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 || res.status === 403) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesi berakhir atau akses ditolak.');
  }

  return res;
}

function formatIDR(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function logout() {
  try {
    await authFetch('/admin/logout', { method: 'POST' });
  } catch (e) {
    // logout must always succeed client-side regardless of server response
  }
  clearSession();
  window.location.href = 'login.html';
}

function renderAdminShell(activePage) {
  const navItems = [
    { key: 'withdrawals', icon: '📋', label: 'Withdrawal', href: 'withdrawals.html' },
    { key: 'providers', icon: '💳', label: 'Payment Provider', href: 'payment-providers.html' },
  ];

  const sidebarHtml = navItems.map((item) => `
    <a href="${item.href}" class="nav-item ${item.key === activePage ? 'active' : ''}">
      <span class="icon">${item.icon}</span> ${item.label}
    </a>
  `).join('');

  document.getElementById('dashboard-sidebar-mount').innerHTML = `
    <aside class="admin-sidebar">
      <div class="logo">DannShop Admin</div>
      ${sidebarHtml}
      <div class="sidebar-footer">
        <button class="logout-btn" onclick="logout()">↪ Keluar</button>
      </div>
    </aside>
  `;
}
