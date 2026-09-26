/**
 * Local bridge client.
 *
 * Requests to localhost / private ranges are never proxied by the Outbox server —
 * the backend refuses them (SSRF protection). Instead the installed extension's
 * content script, which shares this page's origin, forwards them from the user's
 * own machine and posts the result back.
 *
 * Wire protocol (window.postMessage, same-origin only):
 *   page -> extension : { source: 'outbox-app',    type: 'PING' | 'EXECUTE', id, payload }
 *   extension -> page : { source: 'outbox-bridge', type: 'PONG' | 'RESULT' | 'ERROR', id, payload }
 */

const APP = 'outbox-app'
const BRIDGE = 'outbox-bridge'

let seq = 0
const nextId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`

function call(type, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = nextId()
    let settled = false

    const onMessage = (event) => {
      if (event.source !== window) return
      const data = event.data
      if (!data || data.source !== BRIDGE || data.id !== id) return
      cleanup()
      if (data.type === 'ERROR') reject(new Error(data.payload?.message || 'Bridge error'))
      else resolve(data.payload)
    }

    const cleanup = () => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Bridge did not respond'))
    }, timeoutMs)

    window.addEventListener('message', onMessage)
    window.postMessage({ source: APP, type, id, payload }, window.location.origin)
  })
}

/** Resolves to the bridge version when the extension is installed and enabled. */
export async function pingBridge() {
  try {
    const pong = await call('PING', null, 1200)
    return { connected: true, version: pong?.version || 'unknown' }
  } catch {
    return { connected: false, version: null }
  }
}

/** Forward one request through the extension. Times out so the UI can't hang. */
export function executeViaBridge(payload, timeoutMs = 30000) {
  return call('EXECUTE', payload, timeoutMs + 2000)
}

/** Subscribe to connection changes; returns an unsubscribe function. */
export function watchBridge(onChange, intervalMs = 8000) {
  let stopped = false
  let last = null

  const tick = async () => {
    const state = await pingBridge()
    if (stopped) return
    if (!last || last.connected !== state.connected) {
      last = state
      onChange(state)
    }
  }

  tick()
  const timer = setInterval(tick, intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
