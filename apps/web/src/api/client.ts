const STORAGE_KEY = 'yangguang-yiliao.auth.token'

/**
 * Raised when the API rejects the stored token. Callers can skip their own
 * error copy: the token has already been dropped and the app is being routed
 * back to the login screen.
 */
export class AuthExpiredError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`AUTH_EXPIRED ${status}`)
    this.name = 'AuthExpiredError'
    this.status = status
  }
}

type AuthExpiredListener = () => void
const authExpiredListeners = new Set<AuthExpiredListener>()

/**
 * Subscribe to "the stored session is no longer valid". The auth provider uses
 * this to clear its state so `RequireAuth` can redirect, instead of leaving the
 * app mounted with quietly-failed requests and empty data.
 */
export function onAuthExpired(listener: AuthExpiredListener): () => void {
  authExpiredListeners.add(listener)
  return () => {
    authExpiredListeners.delete(listener)
  }
}

function signalAuthExpired(): void {
  setToken(null)
  authExpiredListeners.forEach((listener) => listener())
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:8080'
}

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(STORAGE_KEY, token)
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers })
  // A rejected token (expired / rotated JWT) is 401, but Spring Security answers
  // 403 for an anonymous principal here. Only treat it as a dead session when we
  // actually sent a token, so a failed *login* still surfaces its own error.
  if (token && (res.status === 401 || res.status === 403)) {
    signalAuthExpired()
    throw new AuthExpiredError(res.status)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}
