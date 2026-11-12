import {
  ApiError,
  apiRequest,
  apiUploadFile,
  getApiUrl,
  clearAccessToken,
  getAccessToken,
  saveAccessToken
} from './api.js';

const $ = (id) => document.getElementById(id);

let editingBookId = null;
let activeBookForPrint = null;

const catalogSection = $('catalogSection');
const librarianSection = $('librarianSection');
const loginPanel = $('loginPanel');
const setupPanel = $('setupPanel');
const accountPanel = $('accountPanel');
const invitePanel = $('invitePanel');

const loginForm = $('loginForm');
const setupForm = $('setupForm');
const inviteForm = $('inviteForm');

const loginButton = $('loginButton');
const setupButton = $('setupButton');
const inviteSubmitButton = $('inviteSubmitButton');
const logoutButton = $('logoutButton');
const createInvitationButton = $('createInvitationButton');
const copyInvitationButton = $('copyInvitationButton');

function setStatus(element, message, kind = '') {
  element.textContent = message;
  element.classList.toggle('is-error', kind === 'error');
  element.classList.toggle('is-success', kind === 'success');
  element.classList.toggle('is-warning', kind === 'warning');
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
    too_many_login_attempts: 'Kirish urinishlari ko‘p bo‘ldi. 15 daqiqadan keyin qayta urinib ko‘ring.',
    invalid_setup_token: 'Bir martalik sozlash kodi noto‘g‘ri.',
    setup_already_completed: 'Birinchi administrator hisobi allaqachon yaratilgan. Kirish sahifasidan foydalaning.',
    username_already_used: 'Bu login band. Boshqa login tanlang.',
    invalid_username: 'Login 3–32 belgidan iborat bo‘lishi va lotin harflari yoki raqamlardan foydalanishi kerak.',
    password_policy_not_met: 'Parol kamida 12 ta belgidan iborat bo‘lishi kerak.',
    setup_not_configured: 'Serverda bir martalik sozlash kodi kiritilmagan.',
    too_many_setup_attempts: 'Sozlash urinishlari ko‘p bo‘ldi. Biroz kutib qayta urinib ko‘ring.',
    authentication_required: 'Sessiya tugagan. Qaytadan tizimga kiring.',
    database_unavailable: 'Ma’lumotlar bazasi hozircha mavjud emas.',
    admin_required: 'Taklif havolasini faqat administrator yarata oladi.',
    invalid_invitation: 'Taklif havolasi noto‘g‘ri, eskirgan yoki allaqachon ishlatilgan.',
    too_many_invitation_attempts: 'Taklifni tekshirish urinishlari ko‘p bo‘ldi. Keyinroq qayta urinib ko‘ring.',
    file_replacement_conflict: 'Fayl boshqa sessiyada yangilangan. Ro‘yxatni yangilab, qayta urinib ko‘ring.',
    invalid_title: 'Kitob nomini to‘g‘ri kiriting.',
    invalid_author: 'Muallif nomi juda uzun yoki noto‘g‘ri.',
    invalid_language: 'Kitob tilini tekshiring.',
    invalid_category: 'Kitob bo‘limini tekshiring.',
    invalid_summary: 'Qisqacha tavsif 1200 belgidan oshmasligi kerak.',
    invalid_body_text: 'Kitob matni 30 000 belgidan oshmasligi kerak.',
    pdf_too_large: 'PDF fayl 20 MB dan oshmasligi kerak.',
    cover_too_large: 'Muqova 4 MB dan oshmasligi kerak.',
    unsupported_file_type: 'Fayl formati mos emas. PDF yoki JPG, PNG, WebP tanlang.',
    storage_upload_failed: 'Fayl Backblaze B2 ga yuklanmadi. Saqlash kalitining yozish huquqini tekshirish kerak.',
    book_not_found: 'Bu kitob topilmadi yoki katalogdan olib tashlangan.',
    request_body_too_large: 'Yuborilgan ma’lumot hajmi juda katta.'
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
  invitePanel.classList.toggle('is-hidden', panel !== 'invite');
}

function showLogin(message = '', kind = '') {
  showAuthPanel('login');
  setStatus($('loginStatus'), message, kind);
}

function showAccount(user) {
  $('accountName').textContent = user.username;
  $('accountRole').textContent = user.role === 'admin'
    ? 'Administrator'
    : 'Kutubxonachi';

  $('invitationTools').classList.toggle('is-hidden', user.role !== 'admin');
  $('invitationResult').classList.add('is-hidden');
  $('invitationUrl').value = '';

  showAuthPanel('account');
  setStatus($('accountStatus'), 'Hisobingiz faol.', 'success');
  setStatus($('invitationStatus'), '');
  void loadAdminBooks();
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

function showInviteAcceptance(token) {
  $('inviteToken').value = token;
  showView('librarian');
  showAuthPanel('invite');
  setStatus($('inviteStatus'), '');
}

function updateRoute() {
  const hash = window.location.hash;
  const bookMatch = hash.match(/^#book=([0-9a-f-]{36})$/i);

  if (bookMatch) {
    showView('catalog');
    void openBook(bookMatch[1], false);
    return;
  }

  const isSetup = hash === '#setup';
  const invitationMatch = hash.match(/^#invite=([A-Za-z0-9_-]{40,64})$/);
  const isLibrarian = hash === '#admin' || isSetup || Boolean(invitationMatch);

  showView(isLibrarian ? 'librarian' : 'catalog');

  if (invitationMatch) {
    showInviteAcceptance(invitationMatch[1]);
    return;
  }

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
    showLogin('Administrator hisobi yaratildi. Endi yangi login va parolingiz bilan kiring.', 'success');
  } catch (error) {
    setStatus($('setupStatus'), apiErrorMessage(error, 'setup'), 'error');
  } finally {
    setBusy(setupButton, false, 'Hisob yaratilmoqda...', 'Hisobni yaratish');
  }
});

createInvitationButton.addEventListener('click', async () => {
  setBusy(
    createInvitationButton,
    true,
    'Havola yaratilmoqda...',
    'Taklif havolasini yaratish'
  );
  setStatus($('invitationStatus'), '');

  try {
    const result = await apiRequest('/api/auth/invitations', {
      method: 'POST',
      body: {}
    });

    const inviteUrl =
      window.location.origin +
      window.location.pathname +
      '#invite=' +
      encodeURIComponent(result.invitationToken);

    $('invitationUrl').value = inviteUrl;
    $('invitationResult').classList.remove('is-hidden');
    setStatus(
      $('invitationStatus'),
      'Havola yaratildi. U 30 daqiqa davomida bir marta ishlaydi.',
      'success'
    );
  } catch (error) {
    setStatus(
      $('invitationStatus'),
      apiErrorMessage(error, 'invitation'),
      'error'
    );
  } finally {
    setBusy(
      createInvitationButton,
      false,
      'Havola yaratilmoqda...',
      'Taklif havolasini yaratish'
    );
  }
});

copyInvitationButton.addEventListener('click', async () => {
  const inviteUrl = $('invitationUrl').value;

  if (!inviteUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(inviteUrl);
    setStatus($('invitationStatus'), 'Havola nusxalandi.', 'success');
  } catch {
    $('invitationUrl').focus();
    $('invitationUrl').select();
    setStatus(
      $('invitationStatus'),
      'Havola ajratildi. Uni Ctrl+C orqali nusxalang.',
      'success'
    );
  }
});

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const invitationToken = $('inviteToken').value;
  const username = $('inviteUsername').value.trim();
  const password = $('invitePassword').value;
  const passwordConfirm = $('invitePasswordConfirm').value;

  if (password !== passwordConfirm) {
    setStatus($('inviteStatus'), 'Kiritilgan parollar bir-biriga mos kelmayapti.', 'error');
    return;
  }

  setBusy(
    inviteSubmitButton,
    true,
    'Hisob yaratilmoqda...',
    'Hisobni yaratish'
  );
  setStatus($('inviteStatus'), '');

  try {
    await apiRequest('/api/auth/invitations/accept', {
      method: 'POST',
      body: { invitationToken, username, password }
    });

    inviteForm.reset();
    clearAccessToken();
    window.history.replaceState(null, '', '#admin');
    showLogin('Shaxsiy hisob yaratildi. Endi o‘z loginingiz va parolingiz bilan kiring.', 'success');
  } catch (error) {
    setStatus(
      $('inviteStatus'),
      apiErrorMessage(error, 'invite'),
      'error'
    );
  } finally {
    setBusy(
      inviteSubmitButton,
      false,
      'Hisob yaratilmoqda...',
      'Hisobni yaratish'
    );
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;

  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Clear the local session even when the network is unavailable.
  } finally {
    clearAccessToken();
    logoutButton.disabled = false;
    window.history.replaceState(null, '', '#admin');
    showLogin('Tizimdan chiqdingiz.', 'success');
  }
});



let catalogRequestNumber = 0;
let catalogSearchTimer = null;

function createTextElement(tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value || '';
  return element;
}

function renderCatalog(books) {
  const grid = $('booksGrid');
  grid.replaceChildren();

  $('bookCount').textContent = books.length + ' ta kitob';
  $('emptyBooks').classList.toggle('is-hidden', books.length !== 0);

  for (const book of books) {
    const card = document.createElement('article');
    card.className = 'book-card';

    const cover = document.createElement('div');
    cover.className = 'book-card-cover';

    if (book.coverUrl) {
      const image = document.createElement('img');
      image.src = book.coverUrl;
      image.alt = 'Muqova: ' + book.title;
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      cover.append(image);
    } else {
      cover.append(createTextElement('span', 'book-cover-fallback', '100'));
    }

    const content = document.createElement('div');
    content.className = 'book-card-body';
    content.append(createTextElement('h3', '', book.title));
    content.append(createTextElement(
      'p',
      'book-card-author',
      book.author || 'Muallif ko‘rsatilmagan'
    ));

    const tags = document.createElement('div');
    tags.className = 'book-tags';
    tags.append(createTextElement('span', 'book-tag', book.category));
    tags.append(createTextElement('span', 'book-tag', book.language));
    content.append(tags);

    if (book.summary) {
      content.append(createTextElement('p', 'book-card-summary', book.summary));
    }

    const button = createTextElement('button', 'primary-button book-open-button', 'Kitob haqida');
    button.type = 'button';
    button.addEventListener('click', () => void openBook(book.id));
    content.append(button);

    card.append(cover, content);
    grid.append(card);
  }
}

async function loadCatalog() {
  const requestNumber = ++catalogRequestNumber;
  const parameters = new URLSearchParams();
  const query = $('bookSearch').value.trim();
  const category = $('bookCategoryFilter').value;

  if (query) parameters.set('q', query);
  if (category) parameters.set('category', category);

  setStatus($('catalogStatus'), 'Kitoblar yuklanmoqda...');

  try {
    const suffix = parameters.toString();
    const result = await apiRequest('/api/books' + (suffix ? '?' + suffix : ''));

    if (requestNumber !== catalogRequestNumber) return;

    renderCatalog(Array.isArray(result.books) ? result.books : []);
    setStatus(
      $('catalogStatus'),
      result.count === 0 ? 'Katalogda hozircha kitob yo‘q.' : 'Katalog yangilandi.',
      'success'
    );
  } catch (error) {
    if (requestNumber !== catalogRequestNumber) return;

    $('booksGrid').replaceChildren();
    $('emptyBooks').classList.add('is-hidden');
    setStatus(
      $('catalogStatus'),
      apiErrorMessage(error, 'catalog'),
      'error'
    );
  }
}

async function openBook(id, updateHash = true) {
  const nextHash = '#book=' + encodeURIComponent(id);

  if (updateHash && window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }

  const dialog = $('bookDialog');
  const body = $('bookDialogBody');
  dialog.classList.remove('is-hidden');
  body.replaceChildren(createTextElement('p', 'muted', 'Kitob ma’lumotlari yuklanmoqda...'));

  try {
    const result = await apiRequest('/api/books/' + encodeURIComponent(id));
    const book = result.book;
    activeBookForPrint = book;

    $('bookDialogTitle').textContent = book.title;
    $('bookDialogMeta').textContent = [
      book.author || 'Muallif ko‘rsatilmagan',
      book.language,
      book.category
    ].filter(Boolean).join(' · ');

    const qrImage = $('bookQrImage');
    qrImage.src = getApiUrl(book.qrPath || ('/api/books/' + encodeURIComponent(id) + '/qr.svg'));
    qrImage.alt = 'QR-kod: ' + book.title;

    const publicUrl = $('bookPublicUrl');
    publicUrl.href = book.publicUrl;
    publicUrl.textContent = book.publicUrl;

    body.replaceChildren();

    if (book.coverUrl) {
      const cover = document.createElement('img');
      cover.className = 'book-detail-cover';
      cover.src = book.coverUrl;
      cover.alt = 'Muqova: ' + book.title;
      cover.referrerPolicy = 'no-referrer';
      body.append(cover);
    }

    if (book.summary) {
      body.append(createTextElement('p', 'book-detail-summary', book.summary));
    }

    if (book.pdfUrl) {
      const pdfLink = createTextElement('a', 'primary-button pdf-open-link', 'PDF kitobni ochish');
      pdfLink.href = book.pdfUrl;
      pdfLink.target = '_blank';
      pdfLink.rel = 'noopener noreferrer';
      body.append(pdfLink);
    }

    if (book.bodyText) {
      body.append(createTextElement('h3', 'book-text-heading', 'Kitob matni'));
      body.append(createTextElement('pre', 'book-detail-text', book.bodyText));
    }

    if (!book.pdfUrl && !book.bodyText) {
      body.append(createTextElement(
        'p',
        'muted',
        'Bu kitob uchun hozircha PDF yoki matnli nusxa biriktirilmagan.'
      ));
    }
  } catch (error) {
    activeBookForPrint = null;
    body.replaceChildren(createTextElement(
      'p',
      'form-status is-error',
      apiErrorMessage(error, 'book')
    ));
  }
}

async function waitForImage(image) {
  if (!image || !image.src || image.complete) return;

  await new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  });
}

async function printBookCard() {
  if (!activeBookForPrint) return;

  try {
    const fresh = await apiRequest(
      '/api/books/' + encodeURIComponent(activeBookForPrint.id)
    );
    activeBookForPrint = fresh.book;
  } catch {
    // Use the latest details already shown in the book dialog.
  }

  const book = activeBookForPrint;
  $('printBookTitle').textContent = book.title || '';
  $('printBookAuthor').textContent = book.author
    ? 'Muallif: ' + book.author
    : 'Muallif ko‘rsatilmagan';
  $('printBookCategory').textContent = [book.category, book.language]
    .filter(Boolean).join(' · ');
  $('printBookSummary').textContent = book.summary || '';

  const coverWrap = $('printCoverWrap');
  const coverImage = $('printCoverImage');
  const details = $('printBookDetails');

  if (book.coverUrl) {
    coverWrap.classList.remove('is-hidden');
    details.classList.remove('without-cover');
    coverImage.src = book.coverUrl;
    coverImage.alt = 'Muqova: ' + book.title;
  } else {
    coverWrap.classList.add('is-hidden');
    details.classList.add('without-cover');
    coverImage.removeAttribute('src');
  }

  $('printQrImage').src = getApiUrl(
    book.qrPath || ('/api/books/' + encodeURIComponent(book.id) + '/qr.svg')
  );
  $('printBookUrl').textContent = book.publicUrl || '';

  const printSheet = $('printSheet');
  printSheet.classList.remove('is-hidden');

  await Promise.all([
    waitForImage($('printQrImage')),
    book.coverUrl ? waitForImage(coverImage) : Promise.resolve()
  ]);

  window.print();
  printSheet.classList.add('is-hidden');
}

function closeBookDialog() {
  $('bookDialog').classList.add('is-hidden');

  if (window.location.hash.startsWith('#book=')) {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search + '#catalog'
    );
  }
}

function renderAdminBooks(books) {
  const list = $('adminBooksList');
  list.replaceChildren();

  if (books.length === 0) {
    list.append(createTextElement('p', 'muted', 'Hozircha katalogga kitob qo‘shilmagan.'));
    return;
  }

  for (const book of books) {
    const row = document.createElement('div');
    row.className = 'admin-book-row';

    const info = document.createElement('div');
    info.className = 'admin-book-info';
    info.append(createTextElement('strong', '', book.title));
    info.append(createTextElement(
      'span',
      'muted',
      (book.author || 'Muallif ko‘rsatilmagan') +
      (book.pdfName ? ' · PDF biriktirilgan' : ' · PDF yo‘q')
    ));

    const actions = document.createElement('div');
    actions.className = 'admin-book-actions';

    const editButton = createTextElement('button', 'secondary-button edit-book-button', 'Tahrirlash');
    editButton.type = 'button';
    editButton.addEventListener('click', () => void startBookEdit(book.id));

    const archiveButton = createTextElement('button', 'secondary-button archive-book-button', 'Katalogdan yashirish');
    archiveButton.type = 'button';
    archiveButton.addEventListener('click', async () => {
      if (!window.confirm('Ushbu kitobni ommaviy katalogdan yashirishni xohlaysizmi?')) {
        return;
      }

      archiveButton.disabled = true;

      try {
        await apiRequest('/api/books/' + encodeURIComponent(book.id), {
          method: 'DELETE'
        });
        setStatus($('bookFormStatus'), 'Kitob katalogdan yashirildi.', 'success');
        await Promise.all([loadAdminBooks(), loadCatalog()]);
      } catch (error) {
        setStatus($('bookFormStatus'), apiErrorMessage(error, 'book'), 'error');
        archiveButton.disabled = false;
      }
    });

    actions.append(editButton, archiveButton);
    row.append(info, actions);
    list.append(row);
  }
}

async function loadAdminBooks() {
  const list = $('adminBooksList');
  if (!list || !getAccessToken()) return;

  list.replaceChildren(createTextElement('p', 'muted', 'Ro‘yxat yuklanmoqda...'));

  try {
    const result = await apiRequest('/api/books');
    renderAdminBooks(Array.isArray(result.books) ? result.books : []);
  } catch (error) {
    list.replaceChildren(createTextElement(
      'p',
      'form-status is-error',
      apiErrorMessage(error, 'admin-books')
    ));
  }
}

function showBookFormMode(isEditing, book = null) {
  editingBookId = isEditing && book ? book.id : null;

  $('saveBookButton').textContent = isEditing
    ? 'O‘zgarishlarni saqlash'
    : 'Kitobni saqlash';

  $('cancelBookEdit').classList.toggle('is-hidden', !isEditing);

  if (isEditing && book) {
    const files = [];
    if (book.pdfName) files.push('PDF: ' + book.pdfName);
    if (book.coverName) files.push('Muqova: ' + book.coverName);

    $('bookFilesNotice').textContent = files.length
      ? 'Hozirgi fayllar saqlanadi. Yangi fayl tanlasangiz, u mavjud fayl o‘rnini egallaydi. ' + files.join(' · ')
      : 'Hozircha PDF yoki muqova biriktirilmagan.';

    $('bookFilesNotice').classList.remove('is-hidden');
  } else {
    $('bookFilesNotice').textContent = '';
    $('bookFilesNotice').classList.add('is-hidden');
  }
}

async function startBookEdit(id) {
  setStatus($('bookFormStatus'), 'Kitob ma’lumotlari ochilmoqda...');

  try {
    const result = await apiRequest('/api/books/' + encodeURIComponent(id));
    const book = result.book;

    $('bookTitle').value = book.title || '';
    $('bookAuthor').value = book.author || '';
    $('bookLanguage').value = book.language || 'O‘zbekcha';
    $('bookCategory').value = book.category || 'Badiiy adabiyot';
    $('bookSummary').value = book.summary || '';
    $('bookBodyText').value = book.bodyText || '';
    $('bookPdf').value = '';
    $('bookCover').value = '';

    showBookFormMode(true, book);
    setStatus($('bookFormStatus'), 'Kitob ma’lumotlari tahrirlash uchun yuklandi.', 'success');
    $('bookForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('bookTitle').focus({ preventScroll: true });
  } catch (error) {
    setStatus($('bookFormStatus'), apiErrorMessage(error, 'book'), 'error');
  }
}

function cancelBookEdit() {
  $('bookForm').reset();
  showBookFormMode(false);
  setStatus($('bookFormStatus'), 'Tahrirlash bekor qilindi.');
}

async function saveBookFromForm(event) {
  event.preventDefault();

  const pdf = $('bookPdf').files[0] || null;
  const cover = $('bookCover').files[0] || null;
  const isEditing = Boolean(editingBookId);
  const targetId = editingBookId;

  if (pdf && (pdf.type !== 'application/pdf' || pdf.size > 20 * 1024 * 1024)) {
    setStatus($('bookFormStatus'), 'PDF faylni tekshiring: faqat PDF, 20 MB gacha.', 'error');
    return;
  }

  if (cover && (
    !['image/jpeg', 'image/png', 'image/webp'].includes(cover.type) ||
    cover.size > 4 * 1024 * 1024
  )) {
    setStatus($('bookFormStatus'), 'Muqova JPG, PNG yoki WebP bo‘lishi va 4 MB dan oshmasligi kerak.', 'error');
    return;
  }

  const button = $('saveBookButton');
  setBusy(
    button,
    true,
    isEditing ? 'O‘zgarishlar saqlanmoqda...' : 'Kitob saqlanmoqda...',
    isEditing ? 'O‘zgarishlarni saqlash' : 'Kitobni saqlash'
  );
  setStatus($('bookFormStatus'), '');

  let createdBookId = null;
  let savedBookId = targetId;
  const cleanupWarnings = [];

  try {
    const payload = {
      title: $('bookTitle').value.trim(),
      author: $('bookAuthor').value.trim(),
      language: $('bookLanguage').value,
      category: $('bookCategory').value,
      summary: $('bookSummary').value.trim(),
      bodyText: $('bookBodyText').value.trim()
    };

    const result = await apiRequest(
      isEditing
        ? '/api/books/' + encodeURIComponent(targetId)
        : '/api/books',
      {
        method: isEditing ? 'PUT' : 'POST',
        body: payload
      }
    );

    savedBookId = result.book.id;
    if (!isEditing) createdBookId = savedBookId;

    if (cover) {
      setStatus($('bookFormStatus'), 'Muqova Backblaze B2 ga yuklanmoqda...');
      const path = '/api/books/' + encodeURIComponent(savedBookId) +
        '/files/cover?filename=' + encodeURIComponent(cover.name);
      const uploadResult = await apiUploadFile(path, cover);

      if (uploadResult?.file?.cleanupPending) {
        cleanupWarnings.push('eski muqova nusxasini o‘chirish yakunlanmadi');
      }
    }

    if (pdf) {
      setStatus($('bookFormStatus'), 'PDF fayl Backblaze B2 ga yuklanmoqda...');
      const path = '/api/books/' + encodeURIComponent(savedBookId) +
        '/files/pdf?filename=' + encodeURIComponent(pdf.name);
      const uploadResult = await apiUploadFile(path, pdf);

      if (uploadResult?.file?.cleanupPending) {
        cleanupWarnings.push('eski PDF nusxasini o‘chirish yakunlanmadi');
      }
    }

    $('bookForm').reset();
    showBookFormMode(false);

    if (cleanupWarnings.length > 0) {
      setStatus(
        $('bookFormStatus'),
        'Yangi fayl faol. Ammo ' + cleanupWarnings.join(' va ') +
          '. Backblaze kalitiga fayl versiyalarini o‘chirish huquqi berilishi kerak.',
        'warning'
      );
    } else {
      setStatus(
        $('bookFormStatus'),
        isEditing
          ? 'Kitob ma’lumotlari yangilandi, eski fayllar almashtirildi va tozalandi. QR-kod o‘zgarmadi.'
          : 'Kitob saqlandi. Uning doimiy QR-kodi yaratildi.',
        'success'
      );
    }

    await Promise.all([loadCatalog(), loadAdminBooks()]);
    if (savedBookId) {
      await openBook(savedBookId);
    }
  } catch (error) {
    if (createdBookId) {
      await apiRequest('/api/books/' + encodeURIComponent(createdBookId), {
        method: 'DELETE'
      }).catch(() => undefined);
    }

    const message = isEditing
      ? 'Ba’zi ma’lumotlar yoki fayllar saqlangan bo‘lishi mumkin. Katalogdagi yozuvni tekshiring. ' + apiErrorMessage(error, 'book')
      : apiErrorMessage(error, 'book');

    setStatus($('bookFormStatus'), message, 'error');
  } finally {
    setBusy(
      button,
      false,
      'Saqlanmoqda...',
      editingBookId ? 'O‘zgarishlarni saqlash' : 'Kitobni saqlash'
    );
  }
}

$('bookSearch').addEventListener('input', () => {
  window.clearTimeout(catalogSearchTimer);
  catalogSearchTimer = window.setTimeout(() => void loadCatalog(), 250);
});

$('bookCategoryFilter').addEventListener('change', () => void loadCatalog());
$('refreshBooksButton').addEventListener('click', () => void loadCatalog());
$('refreshAdminBooksButton').addEventListener('click', () => void loadAdminBooks());
$('bookForm').addEventListener('submit', saveBookFromForm);
$('cancelBookEdit').addEventListener('click', cancelBookEdit);
$('printBookButton').addEventListener('click', () => void printBookCard());
$('closeBookDialog').addEventListener('click', closeBookDialog);

$('bookDialog').addEventListener('click', (event) => {
  if (event.target === $('bookDialog')) closeBookDialog();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('bookDialog').classList.contains('is-hidden')) {
    closeBookDialog();
  }
});


window.addEventListener('hashchange', updateRoute);

updateRoute();
void loadCatalog();
