const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
const MAX_LOCAL_RESPONSE_BYTES = 25 * 1024 * 1024
const LOCAL_SESSION_PREFIX = 'outpath_local_session:'


export function getLocalBrowserSupport() {
  if (typeof navigator === 'undefined') {
    return { supported: false, browser: 'Unknown', version: 0, mobile: false }
  }

  const ua = navigator.userAgent || ''
  const brands = Array.isArray(navigator.userAgentData?.brands)
    ? navigator.userAgentData.brands.map((item) => item.brand)
    : []
  const mobile = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(ua)

  let browser = 'Other'
  let version = 0
  let match = null

  const edgeBrand = brands.find((brand) => /Microsoft Edge/i.test(brand))
  const chromeBrand = brands.find((brand) => /Google Chrome/i.test(brand))

  if (edgeBrand || /Edg\//i.test(ua)) {
    browser = 'Edge'
    match = ua.match(/Edg(?:A|iOS)?\/([\d.]+)/i)
  } else if (chromeBrand || /Chrome\//i.test(ua)) {
    browser = 'Chrome'
    match = ua.match(/Chrome\/([\d.]+)/i)
  }

  version = match ? Number.parseInt(match[1], 10) || 0 : 0

  const supported = !mobile && ((browser === 'Chrome' && version >= 142) || (browser === 'Edge' && version >= 143))

  return { supported, browser, version, mobile }
}

export function isLocalBrowserSupported() {
  return getLocalBrowserSupport().supported
}

function isLocalDestinationHost(host) {
  if (LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return true
  if (/^::ffff:(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(host)) return true
  return false
}

export class LocalRequestError extends Error {
  constructor(message, code = 'local_request_failed') {
    super(message)
    this.name = 'LocalRequestError'
    this.code = code
  }
}

function normaliseHost(hostname) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
}

export function isLoopbackTarget(url) {
  try {
    const host = normaliseHost(new URL(url).hostname)
    return isLocalDestinationHost(host)
  } catch {
    return false
  }
}

function targetAddressSpace(url) {
  let host = ''
  try { host = normaliseHost(new URL(url).hostname) } catch {}
  return isLoopbackHost(host) ? 'loopback' : 'local'
}

export async function getLocalNetworkPermission(url) {
  try {
    const host = normaliseHost(new URL(url).hostname)
    const permissionName = isLoopbackHost(host) ? 'loopback-network' : 'local-network'
    if (!navigator.permissions?.query) return 'unknown'
    const result = await navigator.permissions.query({ name: permissionName })
    return result.state
  } catch {
    return 'unknown'
  }
}

function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(host) || /^127\./.test(host) || /^::1$/i.test(host)
}

function localSessionKey(url) {
  return `${LOCAL_SESSION_PREFIX}${url.origin}`
}

function getLocalSessionToken(url) {
  try { return localStorage.getItem(localSessionKey(url)) || '' } catch { return '' }
}

function setLocalSessionToken(url, token) {
  try {
    if (token) localStorage.setItem(localSessionKey(url), token)
  } catch {}
}

function clearLocalSessionToken(url) {
  try { localStorage.removeItem(localSessionKey(url)) } catch {}
}

function isLocalAuthPath(url) {
  const path = url.pathname.replace(/\/+$/, '')
  return path === '/api/auth/login' || path === '/api/auth/register' || path === '/api/auth/google' || path === '/api/auth/google/verify'
}

function isLocalLogoutPath(url) {
  return url.pathname.replace(/\/+$/, '') === '/api/auth/logout'
}

function isPermissionDeniedError(error) {
  const message = String(error?.message || '')
  return /permission|denied|blocked|local network|loopback|apps on device/i.test(message)
}

function buildUrl(baseUrl, params = []) {
  const url = new URL(baseUrl)
  for (const p of params) {
    if (!p?.key) continue
    url.searchParams.append(String(p.key), String(p.value ?? ''))
  }
  return url.toString()
}

function applyAuth(headers, url, auth = {}) {
  const kind = auth.type || 'none'
  if (kind === 'bearer' && auth.token) {
    headers.Authorization = `Bearer ${auth.token}`
  } else if (kind === 'basic' && (auth.username || auth.password)) {
    const raw = `${auth.username || ''}:${auth.password || ''}`
    headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(raw)))}`
  } else if (kind === 'apikey' && auth.key && auth.value) {
    if ((auth.in || 'header') === 'query') {
      url.searchParams.append(auth.key, auth.value)
    } else {
      headers[auth.key] = auth.value
    }
  }
}

async function readTextWithLimit(response) {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_LOCAL_RESPONSE_BYTES) {
    throw new LocalRequestError('The local response is larger than 25 MB.', 'response_too_large')
  }
  if (!response.body) return await response.text()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_LOCAL_RESPONSE_BYTES) {
        await reader.cancel()
        throw new LocalRequestError('The local response is larger than 25 MB.', 'response_too_large')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return text
  } finally {
    reader.releaseLock()
  }
}

export async function executeLocalRequest(payload, { signal } = {}) {
  const browserSupport = getLocalBrowserSupport()
  if (!browserSupport.supported) {
    throw new LocalRequestError(
      'Localhost testing is available in desktop Chrome 142+ and Edge 143+. Open Outpath there to use local API requests.',
      'unsupported_browser',
    )
  }

  if (!window.isSecureContext) {
    throw new LocalRequestError(
      'Local API testing requires an HTTPS Outpath page. Use https://outpath.vercel.app or localhost during development.',
      'insecure_context',
    )
  }

  let url
  try {
    url = new URL(buildUrl(payload.url, payload.params))
  } catch {
    throw new LocalRequestError('Enter a valid HTTP or HTTPS local URL.', 'invalid_url')
  }

  const host = normaliseHost(url.hostname)
  if (!isLocalDestinationHost(host)) {
    throw new LocalRequestError('This request is not a local/private target. Use the normal Outpath server path for public APIs.', 'not_local_target')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LocalRequestError('Local requests support only http:// and https:// URLs.', 'invalid_protocol')
  }

  const headers = {}
  for (const row of payload.headers || []) {
    if (!row?.key || row.enabled === false) continue
    headers[row.key] = String(row.value ?? '')
  }
  applyAuth(headers, url, payload.auth)

  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
    const localSessionToken = getLocalSessionToken(url)
    if (localSessionToken) headers.Authorization = `Bearer ${localSessionToken}`
  }

  if (['POST', 'PUT', 'PATCH'].includes(payload.method) && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json'
  }

  const startedAt = performance.now()
  let response
  try {
    response = await fetch(url.toString(), {
      method: payload.method,
      headers,
      body: ['GET', 'DELETE'].includes(payload.method) ? undefined : (payload.body || undefined),
      credentials: 'include',
      mode: 'cors',
      redirect: 'follow',
      signal,
      targetAddressSpace: targetAddressSpace(url.toString()),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    const permission = await getLocalNetworkPermission(url.toString())
    const message = error?.message || ''
    if (permission === 'denied' || isPermissionDeniedError(error) || /cors|failed to fetch|networkerror|load failed/i.test(message)) {
      const isLoopback = isLoopbackHost(host)
      const permissionLabel = isLoopback ? 'Apps on device' : 'Local Network'
      throw new LocalRequestError(
        `Chrome blocked this local request. Allow ${permissionLabel} for Outpath in Chrome site settings, then reload. For localhost/127.0.0.1 the permission is Apps on device; for 192.168.x.x/10.x.x.x/private LAN targets it is Local Network. The target API must also allow CORS from ${window.location.origin}.`,
        'local_access_denied',
      )
    }
    throw new LocalRequestError(`Could not reach ${host}. Start the local API and allow CORS for ${window.location.origin}.`, 'local_unreachable')
  }

  const body = await readTextWithLimit(response)
  if (response.status === 401) clearLocalSessionToken(url)
  const headersOut = {}
  response.headers.forEach((value, key) => { headersOut[key] = value })

  if (isLocalAuthPath(url)) {
    try {
      const parsed = JSON.parse(body)
      if (parsed?.session_token) setLocalSessionToken(url, parsed.session_token)
    } catch {}
  } else if (isLocalLogoutPath(url)) {
    clearLocalSessionToken(url)
  }

  return {
    status: response.status,
    status_text: response.statusText,
    duration_ms: Math.round(performance.now() - startedAt),
    size_bytes: new Blob([body]).size,
    headers: headersOut,
    body,
    truncated: false,
  }
}
