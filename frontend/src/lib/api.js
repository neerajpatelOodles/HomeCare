/**
 * Small fetch wrapper for the backend (proxied under /api).
 * - Always sends cookies.
 * - On 401 it tries ONE token refresh, then retries the request.
 * - Concurrent 401s share a single refresh call. This matters because the backend
 *   rotates refresh tokens and treats a reused one as theft.
 * - Accepts JSON bodies or FormData (file uploads).
 */

export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

let refreshPromise = null;

function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const NO_REFRESH = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/auth/set-password'];

async function rawRequest(path, { method = 'GET', body } = {}, canRetry = true) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 401 && canRetry && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) return rawRequest(path, { method, body }, false);
  }
  return res;
}

export async function api(path, options = {}) {
  const res = await rawRequest(path, options);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(res.status, json?.message || 'Something went wrong', json?.errors);
  }
  return json;
}

/** Downloads a protected file (e.g. a résumé) with the login cookie and saves it. */
export async function downloadFile(path, filename) {
  const res = await rawRequest(path);
  if (!res.ok) {
    let msg = 'Download failed';
    try { msg = (await res.json()).message || msg; } catch { /* not json */ }
    throw new ApiError(res.status, msg);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
