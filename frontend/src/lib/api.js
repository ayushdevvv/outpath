const configuredBase = import.meta.env.VITE_API_URL?.trim() || ''
const sameOriginInProduction = import.meta.env.PROD && import.meta.env.VITE_API_SAME_ORIGIN !== 'false'
const SESSION_STORAGE_KEY = 'outpath_session_token'

export const getStoredSessionToken = () => {
  try { return localStorage.getItem(SESSION_STORAGE_KEY) || '' } catch { return '' }
}

export const setStoredSessionToken = (token) => {
  try {
    if (token) localStorage.setItem(SESSION_STORAGE_KEY, token)
  } catch {}
}

export const clearStoredSessionToken = () => {
  try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch {}
}

const BASE = sameOriginInProduction
  ? ''
  : configuredBase
    ? configuredBase.replace(/\/+$/, '')
    : import.meta.env.DEV
      ? 'http://localhost:8000'
      : ''

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.code = detail && !Array.isArray(detail) ? detail.code : undefined
  }
}

/**
 * Single entry point for every backend call.
 * Production Vercel traffic uses the same-origin /api rewrite and an httpOnly
 * cookie. A signed bearer fallback is also attached when available so auth does
 * not depend on cross-site cookie delivery.
 */
export async function request(path, { method = 'GET', body, signal, headers } = {}) {
  if (!sameOriginInProduction && !BASE) {
    throw new ApiError(
      'Outpath API is not configured. Set VITE_API_URL to your FastAPI backend.',
      0,
      { code: 'api_url_missing' },
    )
  }

  let res
  try {
    const sessionToken = getStoredSessionToken()
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : null),
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : null),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError("Can't reach the Outpath API. Check that the backend is running.", 0)
  }

  if (res.status === 204) return null

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { detail: text }
    }
  }

  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && detail.message
          ? detail.message
          : Array.isArray(detail)
            ? detail.map((d) => d.msg || d).join(', ')
            : res.status === 404
              ? 'Outpath API endpoint was not found. Check VITE_API_URL and confirm the latest backend is deployed.'
              : `Request failed with ${res.status}`
    throw new ApiError(message, res.status, detail)
  }
  return data
}

export const api = {
  get: (p, o) => request(p, { ...o, method: 'GET' }),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  del: (p, o) => request(p, { ...o, method: 'DELETE' }),
}

export const GOOGLE_VERIFY_URL = '/api/auth/google/verify'
