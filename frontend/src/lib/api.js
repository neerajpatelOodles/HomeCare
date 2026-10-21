/**
 * Small fetch wrapper for the backend (proxied under /api).
 * - Always sends cookies.
 * - On 401 it tries ONE token refresh, then retries the request.
 * - Concurrent 401s share a single refresh call. This matters because the backend
 *   rotates refresh tokens and treats a reused one as theft.
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

const NO_REFRESH = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];

export async function api(path, { method = 'GET', body } = {}, canRetry = true) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && canRetry && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) return api(path, { method, body }, false);
  }

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
