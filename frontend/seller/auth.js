/**
 * DannShop — Seller Auth Helper
 * Shared across every seller/*.html page. Per Gemini instructions §4:
 * token stored in localStorage after login, sent as
 * "Authorization: Bearer <token>" on every authenticated request.
 */
const API_BASE_URL = 'http://127.0.0.1:8000/api';
const TOKEN_KEY = 'dannshop_token';
const USER_KEY = 'dannshop_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Every seller page (except login.html itself) calls this immediately
 * on load. No token → redirect to login before any UI renders, so an
 * unauthenticated visitor never sees a flash of dashboard content.
 */
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

/**
 * Wraps fetch() with the Authorization header automatically attached,
 * and handles the one cross-cutting auth concern every authenticated
 * page needs identically: a 401 response means the token is invalid/
 * expired, and the correct response is always the same — clear the
 * stale session and send the user back to login, not a confusing
 * in-page error state.
 */
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

  if (res.status === 401) {
    clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesi berakhir, silakan masuk kembali.');
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
    await authFetch('/seller/logout', { method: 'POST' });
  } catch (e) {
    // Even if the server call fails (e.g. already-expired token), we
    // still clear local session and redirect — logout must always
    // succeed from the user's perspective.
  }
  clearSession();
  window.location.href = 'login.html';
}

/**
 * Renders the shared sidebar + bottom tab bar shell, marking the
 * correct nav item active. Called once per page after requireAuth()
 * passes, so every seller page gets identical, consistent navigation
 * (Design System §9.2's "consistency across pages is itself a
 * usability feature" principle).
 */
function renderDashboardShell(activePage) {
  const navItems = [
    { key: 'home', icon: '🏠', label: 'Home', href: 'dashboard.html' },
    { key: 'products', icon: '📦', label: 'Produk', href: 'products.html' },
    { key: 'orders', icon: '🧾', label: 'Pesanan', href: 'orders.html' },
    { key: 'wallet', icon: '💰', label: 'Wallet', href: 'wallet.html' },
    { key: 'settings', icon: '⚙️', label: 'Pengaturan', href: 'settings.html' },
  ];

  const sidebarHtml = navItems.map((item) => `
    <a href="${item.href}" class="nav-item ${item.key === activePage ? 'active' : ''}">
      <span class="icon">${item.icon}</span> ${item.label}
    </a>
  `).join('');

  const tabBarItems = navItems.slice(0, 5).map((item) => `
    <a href="${item.href}" class="tab-item ${item.key === activePage ? 'active' : ''}">
      <span class="icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>
  `).join('');

  document.getElementById('dashboard-sidebar-mount').innerHTML = `
    <aside class="dashboard-sidebar">
      <div class="logo">DannShop</div>
      ${sidebarHtml}
      <div class="sidebar-footer">
        <button class="logout-btn" onclick="logout()" style="background:none;border:none;cursor:pointer;">↪ Keluar</button>
      </div>
    </aside>
  `;

  document.getElementById('bottom-tab-bar-mount').innerHTML = `
    <nav class="bottom-tab-bar">${tabBarItems}</nav>
  `;
}
