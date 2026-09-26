let scriptPromise
let initializedClientId = ''
let activeCredentialHandler = null

export function getGoogleClientId() {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
}

function loadGoogleScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google sign-in is only available in a browser.'))
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-outpath-google-gsi]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.outpathGoogleGsi = 'true'
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('Could not load Google sign-in.'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

async function ensureInitialized(google, clientId) {
  if (initializedClientId === clientId) return

  // Google documents initialize() as a page-level configuration call and
  // recommends invoking it only once. Keep the callback stable and route the
  // latest credential to the currently mounted button/page.
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',
    context: 'signin',
    auto_select: false,
    use_fedcm_for_button: false,
    cancel_on_tap_outside: true,
    callback: (response) => {
      const credential = response?.credential
      const handler = activeCredentialHandler
      if (!credential || !handler) return
      try {
        const result = handler(credential)
        if (result && typeof result.catch === 'function') result.catch(() => {})
      } catch {
        // The page-level handler is responsible for showing the user-facing
        // error. Never leave an async GSI callback as an uncaught rejection.
      }
    },
  })

  google.accounts.id.disableAutoSelect?.()
  initializedClientId = clientId
}

export async function renderGoogleButton(element, onCredential) {
  const clientId = getGoogleClientId()
  if (!clientId) throw new Error('Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID.')
  const google = await loadGoogleScript()
  if (!google?.accounts?.id) throw new Error('Google sign-in is unavailable.')

  activeCredentialHandler = onCredential
  await ensureInitialized(google, clientId)

  element.innerHTML = ''
  google.accounts.id.renderButton(element, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: Math.min(element.clientWidth || 360, 380),
    logo_alignment: 'left',
  })

  // Intentionally do NOT call google.accounts.id.prompt() here.
  // The requested classic Google account-chooser popup is the button's
  // `ux_mode: popup` flow. Calling prompt() additionally starts One Tap/FedCM,
  // which is what produced the AbortError in the browser log.
  return () => {
    if (activeCredentialHandler === onCredential) activeCredentialHandler = null
    try { google.accounts.id.cancel?.() } catch {}
    if (element) element.innerHTML = ''
  }
}
