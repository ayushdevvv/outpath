import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bot, Copy, Lightbulb, Plus, Save, Send, Trash2, Wifi } from 'lucide-react'
import { Badge, Button, Dot, Input, Select, Tabs, cx } from '@/components/ui'
import OutpathPipeline, { stagesFromRun } from '@/components/OutpathPipeline'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'
import { executeLocalRequest, getLocalBrowserSupport, LocalRequestError } from '@/lib/lna'
import {
  ASSERTION_KINDS,
  METHODS,
  METHOD_TONE,
  evaluateAssertions,
  formatBytes,
  resolveAll,
  resolveVars,
  statusTone,
  isLocalTarget,
  redactSecrets,
} from '@/lib/engine'

const uid = () => Math.random().toString(36).slice(2, 9)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function PairEditor({ rows, onChange, placeholder, addLabel = 'Add row' }) {
  const update = (id, patch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="grid gap-2 sm:flex sm:items-center">
          <input
            type="checkbox"
            checked={row.enabled !== false}
            onChange={(e) => update(row.id, { enabled: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#22C55E]"
            aria-label="Include this entry"
          />
          <Input
            mono
            className="h-9 min-w-0 flex-1"
            value={row.key}
            placeholder={placeholder[0]}
            onChange={(e) => update(row.id, { key: e.target.value })}
          />
          <Input
            mono
            className="h-9 min-w-0 flex-[1.4]"
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
  const [localAccessState, setLocalAccessState] = useState('ready')
  const [aiHint, setAiHint] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const localBrowser = useMemo(() => getLocalBrowserSupport(), [])
  const abortRef = useRef(null)
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

  const canSend = req.url.trim().length > 0 && run.phase !== 'sending' && !(isLocalTarget(resolvedUrl.value) && !localBrowser.supported)

  useEffect(() => {
    if (!isDirty) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const send = useCallback(async () => {
    const localTarget = isLocalTarget(resolvedUrl.value)
    if (localTarget && !localBrowser.supported) {
      const message = 'Localhost testing is available in desktop Chrome 142+ and Edge 143+. Open Outpath there to use local API requests.'
      setRun({ phase: 'done', request: req, local: true, error: message })
      toast.warning('Localhost unavailable in this browser', { description: message })
      return
    }
    setAiHint(null)
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
      const controller = new AbortController()
      abortRef.current = controller
      if (local) {
        setLocalAccessState('checking')
        raw = await executeLocalRequest(payload, { signal: abortRef.current?.signal })
        setLocalAccessState('ready')
      } else {
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
        }
      }

      onSaved?.()
    } catch (err) {
      const message = err.message || 'The request could not be completed.'
      if (local && err instanceof LocalRequestError) {
        setLocalAccessState('error')
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
  }, [req, vars, activeEnv, toast, onSaved, resolvedUrl, localBrowser])

  const explainErrorWithGroq = async () => {
    if (aiLoading) return
    setAiLoading(true)
    try {
      const safeBody = run.result?.body || ''
      const result = await api.post('/api/ai/explain-error', {
        method: req.method,
        url: resolvedUrl.value,
        status: run.result?.status ?? null,
        status_text: run.result?.statusText || '',
        error_message: run.error || '',
        response_body: safeBody.slice(0, 3500),
        local: !!run.local,
      })
      setAiHint(result)
    } catch (err) {
      toast.error('AI explanation unavailable', { description: err.message || 'Groq could not explain this response right now.' })
    } finally {
      setAiLoading(false)
    }
  }

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
  const quickHint = getQuickErrorHint(run.result?.status, run.result?.statusText, run.local)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto xl:overflow-hidden">
      <div className="app-toolbar shrink-0 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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

        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select
            value={req.method}
            onChange={(e) => patch({ method: e.target.value })}
            className={cx(
              'mono h-11 w-full sm:w-auto rounded-[10px] border border-line bg-black/30 px-3 text-[12.5px] font-semibold outline-none hover:border-line2 focus:border-accent/50',
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
            className="h-11 min-w-0 w-full flex-1"
            value={req.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="{{base_url}}/api/users"
            spellCheck={false}
            aria-label="Request URL"
          />

          <Button variant="premium" className="h-11 w-full min-w-0 sm:w-auto sm:min-w-[112px]" onClick={send} disabled={!canSend} busy={run.phase === 'sending'}>
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
              <span className={cx('mono flex shrink-0 items-center gap-1.5 text-[10.5px]', localAccessState === 'error' ? 'text-fail' : 'text-hold')}>
                <Wifi size={11} />
                {localAccessState === 'checking' ? 'local network permission' : localAccessState === 'error' ? 'local access blocked' : 'direct local request'}
              </span>
            )}
            {local && (
              <span
                title={localBrowser.supported ? `${localBrowser.browser} supports Outpath local requests in this browser.` : 'Use desktop Chrome or Edge for localhost testing.'}
                className={cx(
                  'mono flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  localBrowser.supported ? 'border-pass/25 bg-pass/10 text-pass' : 'border-fail/25 bg-fail/10 text-fail',
                )}
              >
                <span className={cx('h-1.5 w-1.5 rounded-full', localBrowser.supported ? 'bg-pass' : 'bg-fail')} />
                {localBrowser.supported ? `localhost available · ${localBrowser.browser}` : 'localhost · Chrome / Edge only'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-b border-line bg-black/25 px-4 py-3.5 sm:px-6">
        <OutpathPipeline stages={stages} premium />
      </div>

      <div className="grid shrink-0 xl:min-h-0 xl:flex-1 xl:shrink xl:grid-cols-2 xl:grid-rows-1 xl:divide-x xl:divide-line">
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

          {run.phase === 'done' && (run.error || run.result?.status >= 400) && (
            <div className="mx-3 mt-4 sm:mx-6">
              <ErrorAssistCard
                status={run.result?.status}
                statusText={run.result?.statusText}
                quickHint={quickHint}
                aiHint={aiHint}
                aiLoading={aiLoading}
                onExplain={explainErrorWithGroq}
              />
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

    </div>
  )
}

function getQuickErrorHint(status, statusText, local) {
  if (!status) return local ? 'The browser reached the local-request path, but no HTTP response was received. Check the local service, CORS and browser permission.' : null
  const hints = {
    400: 'The server rejected the request as malformed. Check the route, query parameters and JSON/body shape.',
    401: 'Authentication was rejected. Check the API key, bearer token, session cookie, or whether the token has expired.',
    403: 'The server understood the request but refused it. Check credentials, scopes, roles, or API permissions.',
    404: 'The route or resource was not found. Check the base URL, path, API version and resource ID.',
    405: 'The route exists but does not allow this HTTP method. Try the method the endpoint documents.',
    409: 'The request conflicts with the current resource state, often because the resource already exists or was changed.',
    415: 'The server does not accept this representation. Check Content-Type and the request body format.',
    422: 'The server understood the request but validation failed. Check required fields, types and parameter names.',
    429: 'The API is rate-limiting you. Slow down requests or check its retry/rate-limit guidance.',
    500: 'The server hit an internal error. Your request may be valid; inspect the response body and server logs.',
    502: 'A gateway or upstream service failed while handling the request. Check the upstream dependency and route.',
    503: 'The service is unavailable or overloaded. Check service health and whether the endpoint is temporarily down.',
    504: 'A gateway timed out waiting for the upstream service. Check the endpoint latency and upstream health.',
  }
  return hints[status] || `${status}${statusText ? ` ${statusText}` : ''}: inspect the response body for the endpoint's specific error contract.`
}

function ErrorAssistCard({ status, statusText, quickHint, aiHint, aiLoading, onExplain }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-fail/20 bg-fail/[0.035] shadow-card">
      <div className="flex flex-col gap-3 border-b border-fail/10 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-fail/20 bg-fail/10 text-fail">
            <AlertTriangle size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-text">Something went wrong</p>
            <p className="mono mt-0.5 text-[10.5px] text-muted">
              {status ? `${status}${statusText ? ` · ${statusText}` : ''}` : 'No HTTP response'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onExplain} busy={aiLoading}>
          <Bot size={14} /> {aiHint ? 'Refresh explanation' : 'Explain with Groq'}
        </Button>
      </div>

      <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
        {quickHint && (
          <div className="rounded-xl border border-line bg-black/20 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-text">
              <Lightbulb size={13} className="text-hold" /> Likely issue
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{quickHint}</p>
          </div>
        )}

        {aiHint ? (
          <div className="rounded-xl border border-accent/20 bg-accent/[0.035] p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-text">
              <Bot size={13} className="text-accent" /> {aiHint.title}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{aiHint.summary}</p>
            <p className="mt-2 text-[11px] text-text">{aiHint.likely_cause}</p>
            {aiHint.next_steps?.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted">
                {aiHint.next_steps.map((step, index) => (
                  <li key={`${step}-${index}`} className="flex gap-2">
                    <span className="mono text-accent">{index + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-dim">confidence · {aiHint.confidence}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line2 bg-black/10 p-3">
            <p className="text-[11px] font-semibold text-text">Need more context?</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">Groq can inspect the status, route and safe response snippet and turn it into concrete debugging steps.</p>
          </div>
        )}
      </div>
    </div>
  )
}

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
