/**
 * Runs in the page's context on the Outpath web app origin only (see manifest
 * content_scripts.matches). It never runs on any other site, and it only
 * relays messages tagged with our own protocol — nothing else it sees on
 * the page can reach the background worker.
 */

const APP = 'outpath-app'
const BRIDGE = 'outpath-bridge'

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (!data || data.source !== APP) return
  if (!['PING', 'EXECUTE'].includes(data.type)) return

  chrome.runtime.sendMessage({ type: data.type, id: data.id, payload: data.payload }, (response) => {
    if (chrome.runtime.lastError) {
      window.postMessage(
        {
          source: BRIDGE,
          type: 'ERROR',
          id: data.id,
          payload: { message: chrome.runtime.lastError.message },
        },
        window.location.origin,
      )
      return
    }
    window.postMessage({ ...response, source: BRIDGE, id: data.id }, window.location.origin)
  })
})
