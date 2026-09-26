import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, ExternalLink, Plus, Puzzle, RefreshCw, Save, Send, ShieldCheck, Trash2, Wifi } from 'lucide-react'
import { Badge, Button, Dot, Input, Modal, Select, Tabs, cx } from '@/components/ui'
import OutpathPipeline, { stagesFromRun } from '@/components/OutpathPipeline'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import {
  ASSERTION_KINDS,
  METHODS,
  METHOD_TONE,
  evaluateAssertions,
  formatBytes,
  resolveAll,
  resolveVars,
  statusTone,
  bridgeAvailable,
  bridgeRequest,
  isLocalTarget,
  redactSecrets,
} from '@/lib/engine'

const uid = () => Math.random().toString(36).slice(2, 9)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The backend's execute endpoint only accepts a real database UUID (or
 * nothing at all) for environment_id/request_id. A request that hasn't
 * been saved yet has no server id, so anything that isn't a genuine UUID
 * is dropped rather than forwarded — sending one raises a 422 from the
 * UUID validator.
 */
function asServerId(value) {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}

const BLANK = {
  id: null,
  name: 'Untitled request',
  method: 'GET',
  url: '',
  params: [],
  headers: [],
  auth: { type: 'none', token: '', username: '', password: '', key: '', value: '', in: 'header' },
  body: '',
  assertions: [],
  collection_id: null,
}

function normalise(request) {
  if (!request) return { ...BLANK }
  // Rows persisted on the backend are plain {key, value, enabled} dicts with
  // no id of their own — ids only exist client-side, to give each row a
  // stable React key and a safe target for edits. Without this, every row
  // loaded from a saved request would share the same undefined id, and
  // editing one field would silently edit all of them at once.
  const withIds = (rows) => (rows || []).map((r) => ({ id: r.id || uid(), enabled: true, ...r }))
  return {
    ...BLANK,
    ...request,
    auth: { ...BLANK.auth, ...(request.auth || {}) },
    params: withIds(request.params),
    headers: withIds(request.headers),
    assertions: (request.assertions || []).map((a) => ({ id: a.id || uid(), ...a })),
  }
}

/* ------------------------------------------------------------ key/value rows */

function PairEditor({ rows, onChange, placeholder, addLabel = 'Add row' }) {
  const update = (id, patch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={row.enabled !== false}
            onChange={(e) => update(row.id, { enabled: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#22C55E]"
            aria-label="Include this entry"
          />
          <Input
            mono
            className="h-9 flex-1"
            value={row.key}
            placeholder={placeholder[0]}
            onChange={(e) => update(row.id, { key: e.target.value })}
          />
          <Input
            mono
            className="h-9 flex-[1.4]"
            value={row.value}
            placeholder={placeholder[1]}
            onChange={(e) => update(row.id, { value: e.target.value })}
          />
          <button
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            className="shrink-0 text-muted transition hover:text-fail"
            aria-label="Remove entry"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { id: uid(), key: '', value: '', enabled: true }])}
      >
        <Plus size={14} strokeWidth={2.5} /> {addLabel}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ main */

export default function RequestWorkspace({ initialRequest, vars, activeEnv, onSaved }) {
  const toast = useToast()
  const initialReq = useMemo(() => normalise(initialRequest), [initialRequest])
  const [req, setReq] = useState(() => initialReq)
  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify(initialReq))
  const [collections, setCollections] = useState([])
  const [tab, setTab] = useState('params')
  const [respTab, setRespTab] = useState('body')
  const [run, setRun] = useState({ phase: 'idle' })
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [bridgeState, setBridgeState] = useState({ status: 'unknown', version: null })
  const [bridgePrompt, setBridgePrompt] = useState(null)
  const abortRef = useRef(null)

  const extensionInstallUrl = import.meta.env.VITE_EXTENSION_INSTALL_URL || 'https://chromewebstore.google.com/'

  // Collections only exist once saved — the picker only ever needs to
  // offer genuine, saved collections.
  useEffect(() => {
    setReq(initialReq)
    setSavedFingerprint(JSON.stringify(initialReq))
  }, [initialReq])

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/collections')
      .then((rows) => !cancelled && setCollections(rows))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const patch = (p) => setReq((r) => ({ ...r, ...p }))

  const resolvedUrl = useMemo(() => resolveVars(req.url, vars), [req.url, vars])

  const isDirty = JSON.stringify(req) !== savedFingerprint

  useEffect(() => {
    let cancelled = false
    const local = isLocalTarget(resolvedUrl.value)
    if (!local) {
      setBridgeState({ status: 'unknown', version: null })
      return undefined
    }

    setBridgeState((current) => ({ ...current, status: 'checking' }))
    const timer = window.setTimeout(async () => {
      const state = await bridgeAvailable({ timeoutMs: 1000 })
      if (!cancelled) setBridgeState({ status: state.available ? 'connected' : 'missing', version: state.version })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [resolvedUrl.value])
  const canSend = req.url.trim().length > 0 && run.phase !== 'sending'

  useEffect(() => {
    if (!isDirty) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  /* ---------------------------------------------------------------- send */

  const send = useCallback(async () => {
    const enabled = (rows) => rows.filter((r) => r.enabled !== false && r.key.trim())

    const rawPayload = {
      method: req.method,
      url: req.url,
      params: enabled(req.params).map(({ key, value }) => ({ key, value })),
      headers: enabled(req.headers).map(({ key, value }) => ({ key, value })),
      auth: req.auth,
      body: ['GET', 'DELETE'].includes(req.method) ? '' : req.body,
    }

    const { value: payload, missing } = resolveAll(rawPayload, vars)

    if (missing.length) {
      const message = `Unresolved variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Define ${missing.length > 1 ? 'them' : 'it'} in ${activeEnv?.name || 'an environment'}.`
      setRun({
        phase: 'done',
        request: rawPayload,
        error: message,
      })
      toast.warning('Missing variables', { description: message })
      return
    }

    setRun({ phase: 'sending', request: rawPayload, local: isLocalTarget(payload.url) })

    const startedAt = performance.now()
    const local = isLocalTarget(payload.url)
    try {
      let raw
      if (local) {
        const bridge = await bridgeAvailable({ timeoutMs: 1200 })
        if (!bridge.available) {
          setBridgeState({ status: 'missing', version: null })
          setRun({ phase: 'idle', request: rawPayload, local: true })
          setBridgePrompt({ type: 'install', target: payload.url })
          return
        }
        setBridgeState({ status: 'connected', version: bridge.version })
        raw = await bridgeRequest(payload)
      } else {
        const controller = new AbortController()
        abortRef.current = controller
        raw = await api.post(
          '/api/requests/execute',
          {
            ...payload,
            environment_id: asServerId(activeEnv?.id),
            request_id: asServerId(req.id),
          },
          { signal: controller.signal },
        )
      }

      const durationMs = Math.round(raw.duration_ms ?? raw.durationMs ?? performance.now() - startedAt)
      const bodyText = raw.body ?? ''
      const sizeBytes = raw.size_bytes ?? raw.sizeBytes ?? new Blob([bodyText]).size

      let json = null
      try {
        json = JSON.parse(bodyText)
      } catch {
        json = null
      }

      const result = {
        status: raw.status,
        statusText: raw.status_text ?? raw.statusText ?? '',
        durationMs,
        sizeBytes,
        sizeLabel: formatBytes(sizeBytes),
        headers: raw.headers || {},
        body: bodyText,
        json,
        truncated: !!raw.truncated,
      }

      setRun({
        phase: 'done',
        request: rawPayload,
        local,
        result,
        assertions: evaluateAssertions(req.assertions, result),
      })

      if (local) {
        const secretValues = (activeEnv?.variables || []).filter((v) => v.secret && v.value).map((v) => v.value)
        try {
          await api.post('/api/history', {
            request_id: asServerId(req.id),
            method: req.method,
            url: redactSecrets(payload.url, secretValues),
            status: raw.status,
            duration_ms: durationMs,
            size_bytes: sizeBytes,
          })
        } catch {
          // A bridge request already happened successfully; history failure
          // should not turn a successful local API call into a failed send.
        }
      }

      onSaved?.()
    } catch (err) {
      const message = err.message || 'The request could not be completed.'
      if (local && err.code === 'permission_required') {
        setBridgeState((state) => ({ ...state, status: 'connected' }))
        setRun({ phase: 'idle', request: rawPayload, local: true })
        setBridgePrompt({ type: 'permission', target: payload.url })
        return
      }
      if (local) {
        const secretValues = (activeEnv?.variables || []).filter((v) => v.secret && v.value).map((v) => v.value)
        try {
          await api.post('/api/history', {
            request_id: asServerId(req.id),
            method: req.method,
            url: redactSecrets(payload.url, secretValues),
            error: redactSecrets(message, secretValues),
          })
        } catch {
          // Keep the execution error visible even when history cannot be recorded.
        }
      }
      setRun({
        phase: 'done',
        request: rawPayload,
        local,
        error: message,
      })
      toast.error('Request failed', { description: message })
      onSaved?.()
    } finally {
      abortRef.current = null
    }
  }, [req, vars, activeEnv, toast, onSaved])

  /* ---------------------------------------------------------------- save */

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        name: req.name,
        method: req.method,
        url: req.url,
        params: req.params,
        headers: req.headers,
        auth: req.auth,
        body: req.body,
        assertions: req.assertions,
        collection_id: asServerId(req.collection_id),
      }
      const existingId = asServerId(req.id)
      const saved = existingId
        ? await api.put(`/api/requests/${existingId}`, payload)
        : await api.post('/api/requests', payload)
      const next = normalise(saved)
      setReq(next)
      setSavedFingerprint(JSON.stringify(next))
      toast.success(`“${saved.name}” saved.`)
      onSaved?.()
    } catch (err) {
      setRun((r) => ({ ...r, saveError: err.message }))
      toast.error("Couldn't save request", { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const copyBody = async () => {
    if (!run.result) return
    try {
      await navigator.clipboard.writeText(run.result.body)
      setCopied(true)
      toast.success('Response body copied.')
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.error("Couldn't copy to clipboard")
    }
  }

  const stages = stagesFromRun({
    phase: run.phase,
    request: run.request || req,
    result: run.result,
    assertions: run.assertions,
    error: run.error,
    local: run.local,
  })

  const sendTone = statusTone(run.result?.status)
  const local = isLocalTarget(resolvedUrl.value)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto xl:overflow-hidden">
      {/* ---------------------------------------------------------- command bar */}
      <div className="app-toolbar shrink-0 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <input
            value={req.name}
            onChange={(e) => patch({ name: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-tightest text-text outline-none placeholder:text-muted"
            placeholder="Name this request"
            aria-label="Request name"
          />
          {isDirty && <Badge tone="hold">Unsaved</Badge>}
          {collections.length > 0 && (
            <Select
              value={asServerId(req.collection_id) || ''}
              onChange={(e) => patch({ collection_id: e.target.value || null })}
              className="hidden h-9 sm:block"
              aria-label="Collection"
            >
              <option value="" className="bg-raised">
                No collection
              </option>
              {collections.map((c) => (
                <option key={c.id} value={c.id} className="bg-raised">
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Button variant="outline" size="sm" busy={saving} onClick={save}>
            <Save size={14} /> {isDirty ? 'Save changes' : 'Saved'}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={req.method}
            onChange={(e) => patch({ method: e.target.value })}
            className={cx(
              'mono h-11 rounded-[10px] border border-line bg-black/30 px-3 text-[12.5px] font-semibold outline-none hover:border-line2 focus:border-accent/50',
              METHOD_TONE[req.method],
            )}
            aria-label="HTTP method"
          >
            {METHODS.map((m) => (
              <option key={m} value={m} className="bg-raised text-text">
                {m}
              </option>
            ))}
          </select>

          <Input
            mono
            className="h-11 min-w-[12rem] flex-1"
            value={req.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="{{base_url}}/api/users"
            spellCheck={false}
            aria-label="Request URL"
          />

          <Button variant="premium" className="h-11 min-w-[112px]" onClick={send} disabled={!canSend} busy={run.phase === 'sending'}>
            <Send size={15} /> Send
          </Button>
        </div>

        {req.url && (
          <div className="mt-2.5 flex min-w-0 items-center gap-2">
            <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', local ? 'bg-hold' : 'bg-accent')} />
            <p className="mono min-w-0 flex-1 truncate text-[11px] text-muted" title={resolvedUrl.value}>
              {resolvedUrl.value}
            </p>
            {local && (
              <span className="mono flex shrink-0 items-center gap-1.5 text-[10.5px] text-hold">
                {bridgeState.status === 'connected' ? <Wifi size={11} /> : bridgeState.status === 'checking' ? <RefreshCw size={11} className="animate-spin" /> : <Puzzle size={11} />}
                {bridgeState.status === 'connected' ? 'local bridge connected' : bridgeState.status === 'checking' ? 'checking bridge' : 'bridge required'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- pipeline band */}
      <div className="shrink-0 border-b border-line bg-black/25 px-4 py-3.5 sm:px-6">
        <OutpathPipeline stages={stages} premium />
      </div>

      {/* --------------------------------------------- builder | response split */}
      <div className="grid shrink-0 xl:min-h-0 xl:flex-1 xl:shrink xl:grid-cols-2 xl:grid-rows-1 xl:divide-x xl:divide-line">
        {/* ---------------------------------------------------------- builder */}
        <section className="flex min-w-0 flex-col xl:min-h-0 xl:overflow-y-auto">
          <div className="px-4 pt-4 sm:px-6">
            <h2 className="text-[14px] font-semibold tracking-tightest text-text">Request</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Build, authenticate and send your request.</p>
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            className="mx-4 mt-3 border-b border-line pb-1 sm:mx-6"
            tabs={[
              { id: 'params', label: 'Params', count: req.params.length },
              { id: 'headers', label: 'Headers', count: req.headers.length },
              { id: 'auth', label: 'Auth' },
              { id: 'body', label: 'Body' },
              { id: 'assertions', label: 'Assertions', count: req.assertions.length },
            ]}
          />

          <div className="px-4 py-5 sm:px-6">
            {tab === 'params' && (
              <PairEditor
                rows={req.params}
                onChange={(params) => patch({ params })}
                placeholder={['page', '1']}
                addLabel="Add param"
              />
            )}

            {tab === 'headers' && (
              <PairEditor
                rows={req.headers}
                onChange={(headers) => patch({ headers })}
                placeholder={['Content-Type', 'application/json']}
                addLabel="Add header"
              />
            )}

            {tab === 'auth' && <AuthEditor auth={req.auth} onChange={(auth) => patch({ auth })} />}

            {tab === 'body' && (
              <div>
                {['GET', 'DELETE'].includes(req.method) ? (
                  <p className="text-[13px] text-muted">
                    {req.method} requests are sent without a body. Switch the method to include one.
                  </p>
                ) : (
                  <textarea
                    value={req.body}
                    onChange={(e) => patch({ body: e.target.value })}
                    spellCheck={false}
                    rows={14}
                    placeholder={'{\n  "name": "Ada"\n}'}
                    className="mono w-full rounded-xl border border-line bg-black/30 p-4 text-[12px] leading-relaxed text-text outline-none transition hover:border-line2 focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                  />
                )}
              </div>
            )}

            {tab === 'assertions' && (
              <AssertionEditor
                assertions={req.assertions}
                onChange={(assertions) => patch({ assertions })}
              />
            )}
          </div>
        </section>

        {/* --------------------------------------------------------- response */}
        <section className="flex min-h-[460px] min-w-0 flex-col border-t border-line xl:min-h-0 xl:overflow-y-auto xl:border-t-0">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6">
            <div>
              <h2 className="text-[14px] font-semibold tracking-tightest text-text">Response</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">Status, headers and payload from the real response.</p>
            </div>
            {run.phase === 'done' && run.result && (
              <button
                onClick={copyBody}
                className="mono flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition hover:border-line2 hover:text-text"
              >
                <Copy size={12} /> {copied ? 'Copied' : 'Copy body'}
              </button>
            )}
          </div>

          {run.phase === 'idle' && (
            <div className="grid flex-1 place-items-center px-6 py-14 text-center">
              <div>
                <span className="icon-chip mx-auto">
                  <Send size={18} strokeWidth={1.75} />
                </span>
                <p className="mt-4 font-display text-base text-text">Nothing sent yet</p>
                <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted">
                  Enter a URL and press Send. Status, latency and size will be measured from the real response.
                </p>
              </div>
            </div>
          )}

          {run.phase === 'sending' && (
            <div className="grid flex-1 place-items-center px-6 py-14">
              <div className="flex items-center gap-2 text-muted">
                <Dot tone="hold" pulse />
                <span className="mono text-[12px]">Waiting for the response</span>
              </div>
            </div>
          )}

          {run.phase === 'done' && run.error && (
            <div className="grid flex-1 place-items-center px-6 py-14 text-center">
              <div>
                <Badge tone="fail">Request failed</Badge>
                <p className="mono mx-auto mt-3 max-w-md text-[12px] leading-relaxed text-muted">{run.error}</p>
              </div>
            </div>
          )}

          {run.phase === 'done' && run.result && (
            <>
              <div className="mx-4 mt-4 flex flex-wrap items-center gap-2 sm:mx-6">
                <Badge tone={sendTone} className="text-[12px]">
                  {run.result.status} {run.result.statusText}
                </Badge>
                <Badge>{run.result.durationMs} ms</Badge>
                <Badge>
                  {run.result.sizeLabel}
                  {run.result.truncated ? ' · capped' : ''}
                </Badge>
                {run.assertions?.length > 0 && (
                  <Badge tone={run.assertions.some((a) => a.verdict === 'FAIL') ? 'fail' : 'pass'}>
                    {run.assertions.filter((a) => a.verdict === 'PASS').length}/{run.assertions.length} passed
                  </Badge>
                )}
                {run.result.truncated && <span className="mono text-[10.5px] text-hold">response capped at 5 MB</span>}
              </div>

              <Tabs
                value={respTab}
                onChange={setRespTab}
                className="mx-4 mt-3 border-b border-line pb-1 sm:mx-6"
                tabs={[
                  { id: 'body', label: 'Body' },
                  { id: 'headers', label: 'Headers' },
                  { id: 'raw', label: 'Raw' },
                  { id: 'checks', label: 'Assertions', count: run.assertions?.length || 0 },
                ]}
              />

              <div className="min-h-0 flex-1 px-4 py-5 sm:px-6">
                {respTab === 'body' && (
                  <pre className="mono overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-black/30 p-4 text-[12px] leading-relaxed">
                    {run.result.json ? JSON.stringify(run.result.json, null, 2) : run.result.body || '(empty body)'}
                  </pre>
                )}

                {respTab === 'raw' && (
                  <pre className="mono overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-black/30 p-4 text-[12px] leading-relaxed text-muted">
                    {run.result.body || '(empty body)'}
                  </pre>
                )}

                {respTab === 'headers' && (
                  <div className="overflow-hidden rounded-xl border border-line bg-black/25">
                    <table className="mono w-full text-[12px]">
                      <tbody>
                        {Object.entries(run.result.headers).map(([k, v]) => (
                          <tr key={k} className="border-b border-line/60 align-top last:border-0">
                            <td className="w-1/3 px-4 py-2.5 text-muted">{k}</td>
                            <td className="break-all px-4 py-2.5 text-text">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {respTab === 'checks' && <AssertionResults results={run.assertions} />}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal
        open={!!bridgePrompt}
        onClose={() => setBridgePrompt(null)}
        title={bridgePrompt?.type === 'permission' ? 'Allow local network access' : 'Install the Outpath Local Bridge'}
        description={bridgePrompt?.target ? `Local target detected: ${bridgePrompt.target}` : 'Local APIs never pass through the Outpath server.'}
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setBridgePrompt(null)}>
              Not now
            </Button>
            <Button
              variant="premium"
              size="sm"
              onClick={async () => {
                if (bridgePrompt?.type === 'permission') {
                  window.open(extensionInstallUrl, '_blank', 'noopener,noreferrer')
                  return
                }
                if (extensionInstallUrl) window.open(extensionInstallUrl, '_blank', 'noopener,noreferrer')
              }}
            >
              <ExternalLink size={14} /> {bridgePrompt?.type === 'permission' ? 'Open extension' : 'Get extension'}
            </Button>
          </>
        }
      >
        {bridgePrompt?.type === 'permission' ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-hold/20 bg-hold/5 p-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-hold" size={18} />
              <div>
                <p className="text-sm font-semibold text-text">One-time permission</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Open the Outpath Bridge extension popup and press <span className="mono text-text">Allow local access</span>. Then return here and press Send again.</p>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-black/20 p-3">
              <p className="mono text-[11px] text-muted">TARGET</p>
              <p className="mono mt-1 break-all text-[12px] text-text">{bridgePrompt?.target}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
              <Puzzle className="mt-0.5 shrink-0 text-accent" size={18} />
              <div>
                <p className="text-sm font-semibold text-text">Local requests use your browser</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Outpath blocks localhost and private network targets on the backend for SSRF safety. The browser extension is the secure local bridge.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[['1', 'Install', 'Add Outpath Bridge to Chrome.'], ['2', 'Reload', 'Reload this Outpath tab after installing.'], ['3', 'Send', 'Press Send again to run locally.']].map(([n, title, body]) => (
                <div key={n} className="rounded-xl border border-line bg-black/20 p-3">
                  <div className="mono grid h-6 w-6 place-items-center rounded-md bg-white/5 text-[10px] text-muted">{n}</div>
                  <p className="mt-2 text-[12px] font-semibold text-text">{title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------ auth editor */

const AUTH_TYPES = [
  ['none', 'None'],
  ['bearer', 'Bearer token'],
  ['basic', 'Basic auth'],
  ['apikey', 'API key'],
]

function AuthEditor({ auth, onChange }) {
  const set = (p) => onChange({ ...auth, ...p })

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-black/30 p-1">
        {AUTH_TYPES.map(([id, label]) => (
          <button
            key={id}
            onClick={() => set({ type: id })}
            className={cx(
              'rounded-lg px-3.5 py-1.5 text-[12px] transition',
              auth.type === id ? 'bg-white/10 text-text shadow-[inset_0_0_0_1px_rgba(34,197,94,0.25)]' : 'text-muted hover:text-text',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {auth.type === 'none' && (
        <p className="text-[13px] text-muted">No authorization header will be added.</p>
      )}

      {auth.type === 'bearer' && (
        <Input
          mono
          value={auth.token}
          onChange={(e) => set({ token: e.target.value })}
          placeholder="{{token}}"
        />
      )}

      {auth.type === 'basic' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            mono
            value={auth.username}
            onChange={(e) => set({ username: e.target.value })}
            placeholder="username"
          />
          <Input
            mono
            type="password"
            value={auth.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder="password"
          />
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              mono
              value={auth.key}
              onChange={(e) => set({ key: e.target.value })}
              placeholder="X-API-Key"
            />
            <Input
              mono
              value={auth.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder="{{api_key}}"
            />
          </div>
          <div className="inline-flex gap-1 rounded-xl border border-line bg-black/30 p-1">
            {['header', 'query'].map((where) => (
              <button
                key={where}
                onClick={() => set({ in: where })}
                className={cx(
                  'rounded-md px-3 py-1 text-[12px]',
                  auth.in === where ? 'bg-white/10 text-text' : 'text-muted',
                )}
              >
                Send in {where}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-muted">
        Credentials are resolved at send time and never written to history.
      </p>
    </div>
  )
}

/* ------------------------------------------------------- assertion editor */

function AssertionEditor({ assertions, onChange }) {
  const update = (id, p) => onChange(assertions.map((a) => (a.id === id ? { ...a, ...p } : a)))

  const add = () =>
    onChange([
      ...assertions,
      { id: uid(), kind: 'status', path: '', expected: '200', enabled: true },
    ])

  if (assertions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line2 bg-black/20 p-10 text-center">
        <p className="text-[14px] text-text">No checks on this request</p>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted">
          Add one and it runs on every send, turning the response into a pass or a fail.
        </p>
        <Button size="sm" variant="premium" className="mt-4" onClick={add}>
          <Plus size={14} strokeWidth={2.5} /> Add assertion
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {assertions.map((a) => {
        const kind = ASSERTION_KINDS.find((k) => k.id === a.kind)
        return (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-black/20 p-2.5">
            <input
              type="checkbox"
              checked={a.enabled !== false}
              onChange={(e) => update(a.id, { enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#22C55E]"
              aria-label="Run this assertion"
            />
            <select
              value={a.kind}
              onChange={(e) => update(a.id, { kind: e.target.value })}
              className="mono h-9 rounded-[10px] border border-line bg-black/30 px-2 text-[12px] outline-none"
            >
              {ASSERTION_KINDS.map((k) => (
                <option key={k.id} value={k.id} className="bg-raised">
                  {k.label}
                </option>
              ))}
            </select>

            {kind?.needsPath && (
              <Input
                mono
                className="h-9 min-w-[8rem] flex-1"
                value={a.path}
                onChange={(e) => update(a.id, { path: e.target.value })}
                placeholder="response.user.id"
              />
            )}

            {kind?.needsExpected && (
              <Input
                mono
                className="h-9 w-24"
                value={a.expected}
                onChange={(e) => update(a.id, { expected: e.target.value })}
                placeholder={a.kind === 'latency' ? '500' : '200'}
              />
            )}

            <button
              onClick={() => onChange(assertions.filter((x) => x.id !== a.id))}
              className="ml-auto text-muted transition hover:text-fail"
              aria-label="Remove assertion"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus size={14} strokeWidth={2.5} /> Add assertion
      </Button>
    </div>
  )
}

function AssertionResults({ results }) {
  if (!results || results.length === 0) {
    return <p className="text-[13px] text-muted">This request has no assertions.</p>
  }
  const tone = { PASS: 'pass', FAIL: 'fail', SKIPPED: 'muted' }
  return (
    <ul className="space-y-2">
      {results.map((r) => (
        <li
          key={r.id}
          className={cx(
            'rounded-xl border p-3.5',
            r.verdict === 'FAIL' ? 'border-fail/35 bg-fail/[0.05]' : 'border-line bg-black/20',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="mono truncate text-[12px] text-text">{r.label}</span>
            <Badge tone={tone[r.verdict]}>{r.verdict}</Badge>
          </div>
          <div className="mono mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted">
            <span>expected {String(r.expected)}</span>
            <span className={r.verdict === 'FAIL' ? 'text-fail' : ''}>
              received {String(r.actual)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
