const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
const MAX_LOCAL_RESPONSE_BYTES = 25 * 1024 * 1024

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

function targetAddressSpace() {
  // Chrome's LNA Fetch API accepts the local address-space annotation for
  // both private-network and loopback targets.
  return 'local'
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
      credentials: 'omit',
      mode: 'cors',
      redirect: 'follow',
      signal,
      // Chrome's Local Network Access implementation uses this hint to classify
      // the intended destination and gate the request behind browser permission.
      targetAddressSpace: targetAddressSpace(),
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    const message = error?.message || ''
    if (/cors|failed to fetch|networkerror|load failed/i.test(message)) {
      throw new LocalRequestError(
        `Browser blocked the local request. Allow Local Network Access in your browser and make sure the target API allows CORS for ${window.location.origin}.`,
        'local_access_denied',
      )
    }
    throw new LocalRequestError(`Could not reach ${host}. Start the local API and allow CORS for ${window.location.origin}.`, 'local_unreachable')
  }

  const body = await readTextWithLimit(response)
  const headersOut = {}
  response.headers.forEach((value, key) => { headersOut[key] = value })

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
