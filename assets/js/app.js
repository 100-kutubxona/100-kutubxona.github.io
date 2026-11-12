import {
  ApiError,
  apiRequest,
  clearAccessToken,
  getAccessToken,
  saveAccessToken
} from './api.js';

const $ = (id) => document.getElementById(id);

const catalogSection = $('catalogSection');
const librarianSection = $('librarianSection');
const loginPanel = $('loginPanel');
const setupPanel = $('setupPanel');
const accountPanel = $('accountPanel');

const loginForm = $('loginForm');
const setupForm = $('setupForm');
const loginButton = $('loginButton');
const setupButton = $('setupButton');
const logoutButton = $('logoutButton');

function setStatus(element, message, kind = '') {
  element.textContent = message;
  element.classList.toggle('is-error', kind === 'error');
  element.classList.toggle('is-success', kind === 'success');
}

function setBusy(button, busy, busyText, normalText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : normalText;
}

function apiErrorMessage(error, context) {
  if (!(error instanceof ApiError)) {
    return 'Server bilan bog‘lanib bo‘lmadi. Internet aloqasini tekshirib qayta urinib ko‘ring.';
  }

  const messages = {
    invalid_credentials: 'Login yoki parol noto‘g‘ri.',
    too_many_login_attempts: 'Urinishlar soni oshib ketdi. Biroz kutib, keyin qayta urinib ko‘ring.',
    invalid_setup_token: 'Bir martalik sozlash kodi noto‘g‘ri.',
    setup_already_completed: 'Kutubxonachi hisobi allaqachon yaratilgan. Kirish sahifasidan foydalaning.',
    username_already_used: 'Bu login band. Boshqa login tanlang.',
    invalid_username: 'Login 3–32 belgidan iborat bo‘lishi va lotin harflari yoki raqamlardan foydalanishi kerak.',
    password_policy_not_met: 'Parol kamida 12 ta belgidan iborat bo‘lishi kerak.',
    setup_not_configured: 'Serverda bir martalik sozlash kodi hali kiritilmagan.',
    too_many_setup_attempts: 'Sozlash urinishlari ko‘p bo‘ldi. Biroz kutib qayta urinib ko‘ring.',
    authentication_required: 'Sessiya tugagan. Qaytadan tizimga kiring.',
    database_unavailable: 'Ma’lumotlar bazasi hozircha mavjud emas.'
  };

  if (messages[error.code]) {
    return messages[error.code];
  }

  if (context === 'setup' && error.status === 403) {
    return 'Sozlash so‘rovi rad etildi. Saytning rasmiy manzilidan foydalanayotganingizni tekshiring.';
  }

  return 'So‘rov bajarilmadi. Keyinroq qayta urinib ko‘ring.';
}

function showView(view) {
  const showLibrarian = view === 'librarian';

  catalogSection.classList.toggle('is-hidden', showLibrarian);
  librarianSection.classList.toggle('is-hidden', !showLibrarian);

  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function showAuthPanel(panel) {
  loginPanel.classList.toggle('is-hidden', panel !== 'login');
  setupPanel.classList.toggle('is-hidden', panel !== 'setup');
  accountPanel.classList.toggle('is-hidden', panel !== 'account');
}

function showLogin(message = '', kind = '') {
  showAuthPanel('login');
  setStatus($('loginStatus'), message, kind);
}

function showAccount(user) {
  $('accountName').textContent = user.username;
  showAuthPanel('account');
  setStatus($('accountStatus'), 'Hisobingiz faol.', 'success');
}

async function restoreSession() {
  if (!getAccessToken()) {
    showLogin();
    return;
  }

  showAuthPanel('login');
  setStatus($('loginStatus'), 'Sessiya tekshirilmoqda...');

  try {
    const result = await apiRequest('/api/auth/me');
    showAccount(result.user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAccessToken();
      showLogin('Sessiya tugagan. Qaytadan kiring.', 'error');
      return;
    }

    showLogin(apiErrorMessage(error, 'login'), 'error');
  }
}

function updateRoute() {
  const isSetup = window.location.hash === '#setup';
  const isLibrarian = window.location.hash === '#admin' || isSetup;

  showView(isLibrarian ? 'librarian' : 'catalog');

  if (!isLibrarian) {
    return;
  }

  if (isSetup && !getAccessToken()) {
    showAuthPanel('setup');
    setStatus($('setupStatus'), '');
    return;
  }

  if (getAccessToken()) {
    void restoreSession();
    return;
  }

  showLogin();
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;

    if (view === 'catalog') {
      window.location.hash = 'catalog';
      showView('catalog');
      return;
    }

    window.location.hash = 'admin';
    showView('librarian');

    if (getAccessToken()) {
      void restoreSession();
    } else {
      showLogin();
    }
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;

  setBusy(loginButton, true, 'Tekshirilmoqda...', 'Tizimga kirish');
  setStatus($('loginStatus'), '');

  try {
    const result = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    });

    saveAccessToken(result.accessToken);
    loginForm.reset();
    showAccount(result.user);
    window.history.replaceState(null, '', '#admin');
  } catch (error) {
    setStatus($('loginStatus'), apiErrorMessage(error, 'login'), 'error');
  } finally {
    setBusy(loginButton, false, 'Tekshirilmoqda...', 'Tizimga kirish');
  }
});

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const setupToken = $('setupToken').value;
  const username = $('setupUsername').value.trim();
  const password = $('setupPassword').value;
  const passwordConfirm = $('setupPasswordConfirm').value;

  if (password !== passwordConfirm) {
    setStatus($('setupStatus'), 'Kiritilgan parollar bir-biriga mos kelmayapti.', 'error');
    return;
  }

  setBusy(setupButton, true, 'Hisob yaratilmoqda...', 'Hisobni yaratish');
  setStatus($('setupStatus'), '');

  try {
    await apiRequest('/api/auth/setup', {
      method: 'POST',
      body: { setupToken, username, password }
    });

    setupForm.reset();
    window.history.replaceState(null, '', '#admin');
    showLogin('Hisob yaratildi. Endi yangi login va parolingiz bilan kiring.', 'success');
  } catch (error) {
    setStatus($('setupStatus'), apiErrorMessage(error, 'setup'), 'error');
  } finally {
    setBusy(setupButton, false, 'Hisob yaratilmoqda...', 'Hisobni yaratish');
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;

  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // The local token is cleared even if the network is unavailable.
  } finally {
    clearAccessToken();
    logoutButton.disabled = false;
    window.history.replaceState(null, '', '#admin');
    showLogin('Tizimdan chiqdingiz.', 'success');
  }
});

window.addEventListener('hashchange', updateRoute);

updateRoute();
