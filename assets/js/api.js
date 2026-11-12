const API_BASE = 'https://one00-maktab-kutubxona-api.onrender.com';
export function getApiUrl(path) {\n  return API_BASE + path;\n}\n\nconst TOKEN_KEY = '100_maktab_librarian_session';

export class ApiError extends Error {
  constructor(status, code) {
    super(code || 'request_failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'request_failed';
  }
}

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveAccessToken(token) {
  if (typeof token !== 'string' || token.length < 40) {
    throw new Error('The server returned an invalid session token.');
  }

  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  const response = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined
      ? undefined
      : JSON.stringify(options.body),
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error'
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'request_failed'
    );
  }

  return payload;
}


export async function apiUploadFile(path, file) {
  const headers = new Headers();
  const token = getAccessToken();

  if (token) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  headers.set('Content-Type', file.type || 'application/octet-stream');

  const response = await fetch(API_BASE + path, {
    method: 'PUT',
    headers,
    body: file,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error'
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload && typeof payload.error === 'string'
        ? payload.error
        : 'request_failed'
    );
  }

  return payload;
}
