/**
 * The bridge's own SSRF-style guard. Even though this code runs on the
 * user's own machine, it should only ever forward to local/development
 * targets — it is not meant to become a general-purpose fetch proxy for
 * whatever page happens to talk to it (see content-script.js: only the
 * Outpath origin can reach this worker at all).
 */

const VERSION = '0.2.0'
const EXECUTE_TIMEOUT_MS = 30000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5

function isAllowedTarget(urlString) {
  let url
  try {
    url = new URL(urlString)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1', 'host.docker.internal'].includes(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true
  return false
}

async function getOriginPattern(urlString) {
  return new URL(urlString).origin + '/*'
}

async function hasPermission(urlString) {
  const origin = await getOriginPattern(urlString)
  return chrome.permissions.contains({ origins: [origin] })
}

async function markPendingPermission(urlString) {
  const origin = new URL(urlString).origin
  await chrome.storage.local.set({ pendingOrigin: origin })
}

async function requestPermissionFromPopup(origin) {
  const url = origin.endsWith('/') ? origin : `${origin}/`
  if (!isAllowedTarget(url)) return { granted: false, message: 'That address is outside the local development allowlist.' }
  const pattern = `${origin}/*`
  try {
    const granted = await chrome.permissions.request({ origins: [pattern] })
    if (granted) await chrome.storage.local.remove('pendingOrigin')
    return { granted, origin }
  } catch (error) {
    return { granted: false, message: error?.message || 'Permission request failed.' }
  }
}

function buildUrl(base, params) {
  if (!params?.length) return base
  const usp = new URLSearchParams()
  for (const p of params) if (p.key) usp.append(p.key, p.value ?? '')
  const qs = usp.toString()
  if (!qs) return base
  return base + (base.includes('?') ? '&' : '?') + qs
}

function applyAuth(headers, params, auth) {
  if (!auth) return
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  } else if (auth.type === 'basic' && (auth.username || auth.password)) {
    headers['Authorization'] = `Basic ${btoa(`${auth.username || ''}:${auth.password || ''}`)}`
  } else if (auth.type === 'apikey' && auth.key) {
    if ((auth.in_ || auth.in) === 'query') params.push({ key: auth.key, value: auth.value || '' })
    else headers[auth.key] = auth.value || ''
  }
}

async function readCappedBody(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    let truncated = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
      const remaining = MAX_RESPONSE_BYTES - total
      if (remaining <= 0) {
        truncated = true
        await reader.cancel()
        break
      }
      if (bytes.byteLength > remaining) {
        chunks.push(bytes.slice(0, remaining))
        total += remaining
        truncated = true
        await reader.cancel()
        break
      }
      chunks.push(bytes)
      total += bytes.byteLength
    }
    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { body: new TextDecoder().decode(merged), sizeBytes: total, truncated }
  }
  const text = await response.text()
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength <= MAX_RESPONSE_BYTES) return { body: text, sizeBytes: bytes.byteLength, truncated: false }
  return { body: new TextDecoder().decode(bytes.slice(0, MAX_RESPONSE_BYTES)), sizeBytes: MAX_RESPONSE_BYTES, truncated: true }
}

async function execute(payload) {
  if (!isAllowedTarget(payload.url)) {
    throw new Error('The bridge only forwards to localhost and private development addresses.')
  }
  if (!(await hasPermission(payload.url))) {
    await markPendingPermission(payload.url)
    const error = new Error('Local network permission is required. Open the Outpath Bridge popup and allow access for this address.')
    error.code = 'permission_required'
    throw error
  }

  let headers = {}
  const params = [...(payload.params || [])]
  for (const h of payload.headers || []) if (h.key) headers[h.key] = h.value
  applyAuth(headers, params, payload.auth)

  let url = buildUrl(payload.url, params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXECUTE_TIMEOUT_MS)
  const startedAt = performance.now()

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
      if (!isAllowedTarget(url)) throw new Error('Redirected to an address outside the local/private network allowlist.')
      if (redirect > 0 && !(await hasPermission(url))) {
        await markPendingPermission(url)
        const error = new Error('The redirected local origin needs permission. Open the Outpath Bridge popup and allow access for this address.')
        error.code = 'permission_required'
        throw error
      }

      let res
      try {
        res = await fetch(url, {
          method: payload.method,
          headers,
          body: payload.body && !['GET', 'DELETE'].includes(payload.method) ? payload.body : undefined,
          signal: controller.signal,
          redirect: 'manual',
        })
      } catch (err) {
        if (err.name === 'AbortError') throw new Error(`Timed out after ${EXECUTE_TIMEOUT_MS / 1000}s waiting for your local server.`)
        throw new Error(`Could not reach ${url}. Is your local server running?`)
      }

      if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) {
        const next = new URL(res.headers.get('Location'), url).toString()
        const currentOrigin = new URL(url).origin
        const nextOrigin = new URL(next).origin
        if (currentOrigin !== nextOrigin) {
          headers = Object.fromEntries(
            Object.entries(headers).filter(([key]) => {
              const lower = key.toLowerCase()
              return !['authorization', 'proxy-authorization', 'cookie'].includes(lower) &&
                !['api-key', 'apikey', 'token', 'secret', 'password'].some((part) => lower.includes(part))
            }),
          )
        }
        url = next
        if (redirect === MAX_REDIRECTS) throw new Error(`Too many redirects (max ${MAX_REDIRECTS}).`)
        continue
      }

      const resultBody = await readCappedBody(res)
      const durationMs = Math.round(performance.now() - startedAt)
      const outHeaders = {}
      res.headers.forEach((v, k) => (outHeaders[k] = v))
      return {
        status: res.status,
        statusText: res.statusText,
        durationMs,
        sizeBytes: resultBody.sizeBytes,
        headers: outHeaders,
        body: resultBody.body,
        truncated: resultBody.truncated,
      }
    }
  } finally {
    clearTimeout(timer)
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS}).`)
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ type: 'PONG', payload: { version: VERSION } })
    return false
  }

  if (message.type === 'EXECUTE') {
    execute(message.payload)
      .then((result) => sendResponse({ type: 'RESULT', payload: result }))
      .catch((err) => sendResponse({ type: 'ERROR', payload: { code: err.code, message: err.message } }))
    return true
  }

  if (message.type === 'PERMISSION_STATUS') {
    ;(async () => {
      const pending = (await chrome.storage.local.get('pendingOrigin')).pendingOrigin || null
      let granted = false
      if (pending) granted = await hasPermission(pending + '/')
      sendResponse({ type: 'PERMISSION_STATUS', payload: { pendingOrigin: pending, granted } })
    })()
    return true
  }

  if (message.type === 'REQUEST_PERMISSION') {
    requestPermissionFromPopup(message.origin)
      .then((result) => sendResponse({ type: 'PERMISSION_RESULT', payload: result }))
    return true
  }

  return false
})
