/**
 * Pure request/response logic. No React, no network — everything here is
 * deterministic so the same rules can be mirrored server-side.
 */

const VAR_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g

/** Replace {{name}} with the active environment value. Unknown names are reported. */
export function resolveVars(input, vars) {
  if (typeof input !== 'string') return { value: input, missing: [] }
  const missing = []
  const value = input.replace(VAR_PATTERN, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name]
    missing.push(name)
    return match
  })
  return { value, missing }
}

export function resolveAll(obj, vars) {
  const missing = new Set()
  const walk = (node) => {
    if (typeof node === 'string') {
      const r = resolveVars(node, vars)
      r.missing.forEach((m) => missing.add(m))
      return r.value
    }
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [walk(k), walk(v)]))
    }
    return node
  }
  return { value: walk(obj), missing: [...missing] }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'host.docker.internal'])

/** True when a URL points at the developer's own machine or a private range. */
export function isLocalTarget(url) {
  let host
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  } catch {
    return false
  }
  if (LOCAL_HOSTS.has(host)) return true
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host) || /^ff[0-9a-f]{2}:/i.test(host)) return true
  return false
}

/** Safe dotted/bracket path lookup: response.user.id, items[0].name */
export function getByPath(source, path) {
  if (!path) return undefined
  const cleaned = path.replace(/^(response|body|data)\./, '')
  const keys = cleaned.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let current = source
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined
    current = current[key]
  }
  return current
}

export const ASSERTION_KINDS = [
  { id: 'status', label: 'Status code', needsPath: false, needsExpected: true },
  { id: 'exists', label: 'Field exists', needsPath: true, needsExpected: false },
  { id: 'equals', label: 'Field equals', needsPath: true, needsExpected: true },
  { id: 'latency', label: 'Response time under', needsPath: false, needsExpected: true },
]

function describe(kind, path, expected) {
  switch (kind) {
    case 'status':
      return `status equals ${expected}`
    case 'exists':
      return `${path} exists`
    case 'equals':
      return `${path} equals ${expected}`
    case 'latency':
      return `response time < ${expected}ms`
    default:
      return kind
  }
}

/**
 * Evaluate assertions against a real result.
 * Returns PASS / FAIL / SKIPPED with expected and actual so the UI never has
 * to invent a value.
 */
export function evaluateAssertions(assertions, result) {
  if (!Array.isArray(assertions) || assertions.length === 0) return []
  const parsed = result?.json ?? null

  return assertions.map((a) => {
    const base = { id: a.id, kind: a.kind, label: describe(a.kind, a.path, a.expected) }

    if (!a.enabled) return { ...base, verdict: 'SKIPPED', expected: a.expected ?? '—', actual: '—' }
    if (!result || result.error) {
      return { ...base, verdict: 'SKIPPED', expected: a.expected ?? '—', actual: 'no response' }
    }

    if (a.kind === 'status') {
      const actual = result.status
      return {
        ...base,
        verdict: String(actual) === String(a.expected) ? 'PASS' : 'FAIL',
        expected: a.expected,
        actual,
      }
    }

    if (a.kind === 'latency') {
      const limit = Number(a.expected)
      const actual = result.durationMs
      return {
        ...base,
        verdict: Number.isFinite(limit) && actual < limit ? 'PASS' : 'FAIL',
        expected: `< ${limit}ms`,
        actual: `${actual}ms`,
      }
    }

    if (parsed === null) {
      return { ...base, verdict: 'SKIPPED', expected: a.expected ?? '—', actual: 'body is not JSON' }
    }

    const found = getByPath(parsed, a.path)

    if (a.kind === 'exists') {
      return {
        ...base,
        verdict: found !== undefined ? 'PASS' : 'FAIL',
        expected: 'present',
        actual: found === undefined ? 'missing' : preview(found),
      }
    }

    if (a.kind === 'equals') {
      const actual = found === undefined ? 'missing' : preview(found)
      return {
        ...base,
        verdict: String(found) === String(a.expected) ? 'PASS' : 'FAIL',
        expected: a.expected,
        actual,
      }
    }

    return { ...base, verdict: 'SKIPPED', expected: '—', actual: '—' }
  })
}

function preview(value) {
  if (value === null) return 'null'
  if (typeof value === 'object') return Array.isArray(value) ? `array(${value.length})` : 'object'
  return String(value)
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function statusTone(status) {
  if (!status) return 'muted'
  if (status < 300) return 'pass'
  if (status < 400) return 'hold'
  return 'fail'
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export const METHOD_TONE = {
  GET: 'text-pass',
  POST: 'text-accent',
  PUT: 'text-hold',
  PATCH: 'text-hold',
  DELETE: 'text-fail',
}

/**
 * Replace any secret variable's resolved value with a placeholder before a
 * URL is persisted anywhere. Mirrors what the backend does for
 * server-executed requests in utils/redact.py.
 */
export function redactSecrets(text, secretValues) {
  if (!text || !secretValues || secretValues.length === 0) return text
  let out = text
  for (const value of secretValues) {
    if (!value) continue
    out = out.split(value).join('••••••')
  }
  return out
}


/**
 * Browser-side client for the optional Outbox Local Bridge extension.
 * Communication is isolated to the current page origin and uses one-shot ids
 * so an unrelated window message can never satisfy a request.
 */
function bridgeMessage(type, payload, { timeoutMs = 1500 } = {}) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Local bridge is only available in a browser.'))
  }

  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
    const timer = window.setTimeout(() => {
      finish()
      const error = new Error('The Outbox Local Bridge is not available on this page.')
      error.code = 'bridge_unavailable'
      reject(error)
    }, timeoutMs)

    const onMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data
      if (!data || data.source !== 'outbox-bridge' || data.id !== requestId) return
      finish()
      if (data.type === 'RESULT' || data.type === 'PONG') {
        resolve(data.payload)
        return
      }
      const error = new Error(data.payload?.message || 'The Local Bridge request failed.')
      error.code = data.payload?.code
      reject(error)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ source: 'outbox-app', type, id: requestId, payload }, window.location.origin)
  })
}

export function pingBridge(options) {
  return bridgeMessage('PING', undefined, options)
}

export async function bridgeAvailable(options) {
  try {
    const payload = await pingBridge(options)
    return { available: true, version: payload?.version || null }
  } catch {
    return { available: false, version: null }
  }
}

export function bridgeRequest(payload, { timeoutMs = 12000 } = {}) {
  return bridgeMessage('EXECUTE', payload, { timeoutMs })
}

