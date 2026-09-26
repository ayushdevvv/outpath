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

  // Keep the classic Google account chooser popup for the button.
  // The deprecated `use_fedcm_for_prompt` flag is intentionally not used.
  // One Tap is also requested separately below when Google/browser policy
  // says the prompt is eligible to appear.
  const handleCredential = (response) => {
    if (response?.credential) onCredential(response.credential)
  }

  google.accounts.id.initialize({
    client_id: clientId,
    ux_mode: 'popup',
    context: 'signin',
    auto_select: false,
    use_fedcm_for_button: false,
    callback: handleCredential,
    cancel_on_tap_outside: true,
  })

  google.accounts.id.disableAutoSelect?.()

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

  // Restore the classic One Tap prompt as an additional sign-in surface.
  // Google may suppress it because of session state, user settings, browser
  // policy, or prior dismissal; the normal popup button remains available.
  if (typeof google.accounts.id.prompt === 'function') {
    window.setTimeout(() => {
      google.accounts.id.prompt()
    }, 250)
  }
}
