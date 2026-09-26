let scriptPromise

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

export async function renderGoogleButton(element, onCredential) {
  const clientId = getGoogleClientId()
  if (!clientId) throw new Error('Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID.')
  const google = await loadGoogleScript()
  if (!google?.accounts?.id) throw new Error('Google sign-in is unavailable.')

  // Explicitly force the Google Identity Services popup flow.
  // Do not use redirect UX here; Outpath only needs the Google ID token.
  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',
    context: 'signin',
    auto_select: false,
    use_fedcm_for_prompt: true,
    callback: (response) => {
      if (response?.credential) onCredential(response.credential)
    },
    cancel_on_tap_outside: true,
  })

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
}
