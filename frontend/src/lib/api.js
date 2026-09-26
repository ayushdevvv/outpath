const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
 * Sessions live in an httpOnly cookie, so credentials are always included and
 * no token is ever held in JS memory or localStorage.
 */
export async function request(path, { method = 'GET', body, signal, headers } = {}) {
  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : null),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError("Can't reach the Outbox API. Check that the backend is running.", 0)
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

export const OAUTH_GOOGLE_URL = `${BASE}/api/auth/google/start`
