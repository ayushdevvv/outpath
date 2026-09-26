import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  FolderTree,
  History as HistoryIcon,
  Layers,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  cx,
} from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { METHOD_TONE, statusTone } from '@/lib/engine'

const uid = () => Math.random().toString(36).slice(2, 9)

/** One loader for every panel: loading, error and empty are never blank. */
function useResource(path) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' })

  const load = useCallback(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: '' })
    api
      .get(path)
      .then((data) => !cancelled && setState({ status: 'ready', data, error: '' }))
      .catch((err) => !cancelled && setState({ status: 'error', data: null, error: err.message }))
    return () => {
      cancelled = true
    }
  }, [path])

  useEffect(() => load(), [load])
  return { ...state, reload: load }
}

function PanelFrame({ title, subtitle, action, children }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full px-5 py-7 sm:px-8 lg:px-10">
        <PageHeader title={title} subtitle={subtitle} action={action} />
        {children}
      </div>
    </div>
  )
}

function ListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  )
}

const STATUS_TEXT = { pass: 'text-pass', fail: 'text-fail', hold: 'text-hold', muted: 'text-muted' }

function ConfirmDeleteModal({ open, onClose, onConfirm, busy, itemLabel }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete ${itemLabel || 'this item'}?`}
      description="This can't be undone."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" busy={busy} onClick={onConfirm}>
            <Trash2 size={13} /> Delete
          </Button>
        </>
      }
    />
  )
}


/** Method / URL / status / time — one table for Overview and History. */
const SEND_COLS = 'grid-cols-[56px_minmax(0,1fr)_48px] md:grid-cols-[64px_minmax(0,1fr)_64px_84px] xl:grid-cols-[64px_minmax(0,1fr)_64px_84px_180px]'

function SendsTable({ rows, onOpen, showWhen = false }) {
  return (
    <div className="app-card overflow-hidden">
      <div className={cx('hidden gap-4 border-b border-line px-5 py-3 text-[12px] font-medium text-dim md:grid', SEND_COLS)}>
        <span>Method</span>
        <span>URL</span>
        <span>Status</span>
        <span className="text-right">Time</span>
        {showWhen && <span className="hidden text-right xl:block">When</span>}
      </div>
      <ul>
        {rows.map((h, i) => (
          <li key={h.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}>
            <button
              onClick={() => onOpen(h.request)}
              className={cx('app-row grid w-full items-center gap-4 border-b border-line px-5 py-3.5 text-left last:border-0', SEND_COLS)}
            >
              <span className={cx('mono text-[11.5px] font-semibold', METHOD_TONE[h.method])}>{h.method}</span>
              <span className="mono min-w-0 truncate text-[12px] text-text">{h.url}</span>
              <span className={cx('mono text-[12px]', STATUS_TEXT[statusTone(h.status)])}>{h.status}</span>
              <span className="mono hidden text-right text-[11.5px] text-muted md:block">{h.duration_ms} ms</span>
              {showWhen && (
                <span className="mono hidden text-right text-[11.5px] text-muted xl:block">
                  {new Date(h.created_at).toLocaleString()}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- overview */

export function OverviewPanel({ onOpen, onNavigate, onNewRequest }) {
  const { status, data, error, reload } = useResource('/api/overview')
  const view = data
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = (user?.name || user?.email || '').split(/[ @]/)[0]
  const daily = view?.daily_sends || []
  const peak = Math.max(1, ...daily)
  const isNewUser = status === 'ready' && !view.request_count && !view.history_count

  return (
    <PanelFrame
      title={
        <>
          {greeting}, <span className="text-gradient-accent">{first}</span>
        </>
      }
      subtitle="Here's what's happening with your requests."
      action={
        status === 'ready' && (
          <Button size="md" variant="premium" onClick={onNewRequest}>
            <Plus size={16} strokeWidth={2.5} /> New request
          </Button>
        )
      }
    >
      {isNewUser && (
        <div className="app-card mb-6 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="icon-chip shrink-0">
              <Send size={18} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-text">Nothing sent yet</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Send your first request to see it show up here, measured and verified.
              </p>
            </div>
          </div>
          <Button variant="premium" onClick={onNewRequest} className="w-full sm:w-auto">
            <Plus size={16} strokeWidth={2.5} /> New request
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title="Couldn't load your workspace"
          body={error}
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          }
        />
      )}

      {status === 'ready' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Requests saved', value: view.request_count, target: 'collections', icon: FolderTree, sub: `${view.environment_count} environments` },
              { label: 'Sends recorded', value: view.history_count, target: 'history', icon: Send, sub: `${view.sends_last_7d ?? 0} in the last 7 days` },
              { label: 'Success rate', value: view.success_rate == null ? '—' : `${view.success_rate}%`, target: 'history', icon: Check, sub: 'responses 2xx–3xx' },
              { label: 'Avg latency', value: view.avg_duration_ms == null ? '—' : view.avg_duration_ms, unit: view.avg_duration_ms == null ? '' : 'ms', target: 'history', icon: Clock, sub: 'across all sends' },
            ].map((s, i) => (
              <button
                key={s.label}
                onClick={() => onNavigate(s.target)}
                className="app-card app-card-hover animate-fade-up p-5"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="icon-chip">
                  <s.icon size={18} strokeWidth={1.75} />
                </span>
                <p className="mt-5 text-[13px] font-medium text-muted">{s.label}</p>
                <p className="mt-1.5 flex items-baseline gap-1 text-[32px] font-bold leading-none tracking-tightest text-text">
                  {s.value}
                  {s.unit && <span className="text-[14px] font-medium text-muted">{s.unit}</span>}
                </p>
                <p className="mono mt-3 text-[11px] text-dim">{s.sub}</p>
              </button>
            ))}
          </div>

          <div className={cx('mt-4 grid gap-4', daily.length > 0 && 'xl:grid-cols-[minmax(0,1fr)_380px]')}>
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold tracking-tightest text-text">Recent sends</h2>
                {view.recent?.length > 0 && (
                  <button
                    onClick={() => onNavigate('history')}
                    className="text-[12.5px] text-muted transition hover:text-accent"
                  >
                    View all
                  </button>
                )}
              </div>
              {view.recent?.length ? (
                <SendsTable rows={view.recent} onOpen={onOpen} />
              ) : (
                <EmptyState
                  icon={HistoryIcon}
                  title="No sends yet"
                  body="Start a new request and send it. It will show up here with its status and duration."
                  action={
                    <Button size="sm" variant="premium" onClick={onNewRequest}>
                      <Plus size={15} strokeWidth={2.5} /> New request
                    </Button>
                  }
                />
              )}
            </div>

            {daily.length > 0 && (
              <div className="min-w-0">
                <h2 className="mb-3 text-[15px] font-semibold tracking-tightest text-text">Sends · last 7 days</h2>
                <div className="app-card p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[32px] font-bold leading-none tracking-tightest text-text">{view.sends_last_7d}</p>
                    <span className="mono text-[11px] text-muted">total</span>
                  </div>
                  <div className="mt-6 flex h-32 items-end gap-2.5">
                    {daily.map((n, i) => (
                      <div
                        key={i}
                        title={`${n} sends`}
                        className="flex-1 rounded-md bg-gradient-to-t from-accent-deep/40 to-accent"
                        style={{ height: `${Math.max(6, (n / peak) * 100)}%`, opacity: n ? 1 : 0.22 }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </PanelFrame>
  )
}

/* ------------------------------------------------------------- collections */

export function CollectionsPanel({ onOpen, onChanged }) {
  const { status, data, error, reload } = useResource('/api/collections')
  const toast = useToast()
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const list = data || []

  const create = async () => {
    setBusy(true)
    try {
      await api.post('/api/collections', { name: 'New collection' })
      toast.success('Collection created.')
      reload()
      onChanged?.()
    } catch (err) {
      toast.error("Couldn't create collection", { description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirming) return
    setDeleting(true)
    try {
      await api.del(`/api/collections/${confirming.id}`)
      toast.success(`Deleted “${confirming.name}”.`)
      setConfirming(null)
      reload()
      onChanged?.()
    } catch (err) {
      toast.error("Couldn't delete collection", { description: err.message })
    } finally {
      setDeleting(false)
    }
  }

  const duplicate = async (requestId) => {
    try {
      await api.post(`/api/requests/${requestId}/duplicate`)
      toast.success('Request duplicated.')
      reload()
    } catch (err) {
      toast.error("Couldn't duplicate request", { description: err.message })
    }
  }

  return (
    <PanelFrame
      title="Collections"
      subtitle="Group related requests, usually one per service or feature."
      action={
        <Button variant="premium" busy={busy} onClick={create}>
          <Plus size={16} strokeWidth={2.5} /> New collection
        </Button>
      }
    >
      {status === 'loading' && <ListSkeleton />}

      {status === 'error' && (
        <ErrorState
          title="Couldn't load collections"
          body={error}
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          }
        />
      )}

      {status === 'ready' && list.length === 0 && (
        <EmptyState
          icon={FolderTree}
          title="No collections yet"
          body="Collections group related requests, usually one per service or feature."
          action={
            <Button size="sm" variant="premium" onClick={create}>
              <Plus size={15} strokeWidth={2.5} /> New collection
            </Button>
          }
        />
      )}

      {status === 'ready' && list.length > 0 && (
        <ul className="space-y-3">
          {list.map((c, i) => {
            const expanded = open[c.id] ?? true
            return (
              <li
                key={c.id}
                className="app-card animate-fade-up overflow-hidden"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-center gap-2 px-4 py-3.5">
                  <button
                    onClick={() => setOpen({ ...open, [c.id]: !expanded })}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expanded}
                  >
                    <ChevronRight
                      size={15}
                      className={cx('shrink-0 text-muted transition-transform duration-150', expanded && 'rotate-90 text-accent')}
                    />
                    <span className="truncate text-[14px] font-semibold text-text">{c.name}</span>
                    <span className="mono rounded-full border border-line bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-muted">
                      {c.requests?.length || 0}
                    </span>
                  </button>
                  <button
                    onClick={() => setConfirming(c)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-fail/10 hover:text-fail"
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {expanded && (
                  <ul className="border-t border-line">
                    {c.requests?.length ? (
                      c.requests.map((r) => (
                        <li key={r.id} className="app-row flex items-center gap-2 border-b border-line/60 last:border-0">
                          <button
                            onClick={() => onOpen(r)}
                            className="flex min-w-0 flex-1 items-center gap-4 px-5 py-3 text-left"
                          >
                            <span className={cx('mono w-14 shrink-0 text-[11.5px] font-semibold', METHOD_TONE[r.method])}>
                              {r.method}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-text">{r.name}</span>
                            <span className="mono hidden min-w-0 max-w-[50%] truncate text-[11.5px] text-muted md:block">
                              {r.url}
                            </span>
                          </button>
                          <button
                            onClick={() => duplicate(r.id)}
                            className="mr-4 shrink-0 rounded-md p-1.5 text-muted transition hover:bg-white/[0.06] hover:text-text"
                            aria-label={`Duplicate ${r.name}`}
                          >
                            <Copy size={13} />
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="px-5 py-5 text-[13px] text-muted">
                        Empty. Save a request from the workspace into this collection.
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDeleteModal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={remove}
        busy={deleting}
        itemLabel={confirming?.name}
      />
    </PanelFrame>
  )
}

/* ------------------------------------------------------------ environments */

export function EnvironmentsPanel({ environments, error, onChanged }) {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const startEdit = (env) => {
    setEditing(env.id)
    setRows((env.variables || []).map((v) => ({ ...v, id: v.id || uid() })))
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/api/environments/${editing}/variables`, {
        variables: rows
          .filter((r) => r.name.trim())
          .map(({ name, value, secret }) => ({ name, value, secret: !!secret })),
      })
      toast.success('Environment saved.')
      setEditing(null)
      onChanged?.()
    } catch (err) {
      toast.error("Couldn't save environment", { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const create = async () => {
    setCreating(true)
    try {
      // Environment names must be unique per account — a plain "New
      // environment" would collide (409) the second time this is clicked,
      // so pick a name that's free based on what's already there.
      const taken = new Set((environments || []).map((e) => e.name))
      let name = 'New environment'
      let n = 2
      while (taken.has(name)) {
        name = `New environment ${n++}`
      }
      await api.post('/api/environments', { name })
      toast.success('Environment created.')
      onChanged?.()
    } catch (err) {
      toast.error("Couldn't create environment", { description: err.message })
    } finally {
      setCreating(false)
    }
  }

  const remove = async () => {
    if (!confirming) return
    setDeleting(true)
    try {
      await api.del(`/api/environments/${confirming.id}`)
      toast.success(`Deleted “${confirming.name}”.`)
      setConfirming(null)
      onChanged?.()
    } catch (err) {
      toast.error("Couldn't delete environment", { description: err.message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PanelFrame
      title="Environments"
      subtitle="Hold the values behind {{base_url}}, {{token}} and anything else you reference."
      action={
        <Button variant="premium" busy={creating} onClick={create}>
          <Plus size={16} strokeWidth={2.5} /> New environment
        </Button>
      }
    >
      {error && <ErrorState title="Couldn't load environments" body={error} />}
      {!error && environments === null && <ListSkeleton rows={3} />}

      {!error && environments?.length === 0 && (
        <EmptyState
          icon={Layers}
          title="No environments yet"
          body="An environment holds the values behind {{base_url}}, {{token}} and anything else you reference."
          action={
            <Button size="sm" variant="premium" onClick={create}>
              <Plus size={15} strokeWidth={2.5} /> New environment
            </Button>
          }
        />
      )}

      {!error &&
        environments?.map((env, i) => (
          <Card key={env.id} padding="p-5" className="mb-3 animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="icon-chip shrink-0">
                  <Layers size={18} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold text-text">{env.name}</p>
                  <p className="mono mt-0.5 text-[11px] text-muted">
                    {env.variables?.length || 0} variable{env.variables?.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              {editing === env.id ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" busy={saving} onClick={save}>
                    Save changes
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(env)}>
                    Edit
                  </Button>
                  <button
                    onClick={() => setConfirming(env)}
                    className="rounded-md p-1.5 text-muted transition hover:bg-fail/10 hover:text-fail"
                    aria-label={`Delete ${env.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {editing === env.id ? (
              <div className="mt-4 space-y-2">
                {rows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      mono
                      className="h-9 flex-1"
                      value={row.name}
                      placeholder="base_url"
                      onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))}
                    />
                    <Input
                      mono
                      className="h-9 flex-[1.5]"
                      type={row.secret ? 'password' : 'text'}
                      value={row.value}
                      placeholder="https://api.example.com"
                      onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, value: e.target.value } : r)))}
                    />
                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                      <input
                        type="checkbox"
                        checked={!!row.secret}
                        onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, secret: e.target.checked } : r)))}
                        className="h-3.5 w-3.5 accent-[#22C55E]"
                      />
                      secret
                    </label>
                    <button
                      onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                      className="text-muted transition hover:text-fail"
                      aria-label="Remove variable"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRows([...rows, { id: uid(), name: '', value: '', secret: false }])}
                >
                  <Plus size={14} strokeWidth={2.5} /> Add variable
                </Button>
              </div>
            ) : (
              env.variables?.length > 0 && (
                <ul className="mono mt-4 overflow-hidden rounded-xl border border-line bg-black/25 text-[12px]">
                  {env.variables.map((v) => (
                    <li key={v.id || v.name} className="flex gap-4 border-b border-line/60 px-4 py-2.5 last:border-0">
                      <span className="w-44 shrink-0 truncate text-muted">{`{{${v.name}}}`}</span>
                      <span className="min-w-0 truncate text-text">{v.secret ? '••••••••' : v.value}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </Card>
        ))}

      <ConfirmDeleteModal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={remove}
        busy={deleting}
        itemLabel={confirming?.name}
      />
    </PanelFrame>
  )
}

/* ----------------------------------------------------------------- history */

export function HistoryPanel({ onOpen }) {
  const { status, data, error, reload } = useResource('/api/history?page=1&page_size=50')
  const list = data?.items || []

  return (
    <PanelFrame
      title="History"
      subtitle={data?.total ? `${data.total.toLocaleString()} sends recorded. Showing the latest ${list.length}.` : 'Every send, logged with its method, status and duration.'}
    >
      {status === 'loading' && <ListSkeleton rows={6} />}

      {status === 'error' && (
        <ErrorState
          title="Couldn't load history"
          body={error}
          action={
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          }
        />
      )}

      {status === 'ready' && list.length === 0 && (
        <EmptyState
          icon={HistoryIcon}
          title="No sends recorded"
          body="Every request you send is logged here with its method, status and duration."
        />
      )}

      {status === 'ready' && list.length > 0 && (
        <>
          <SendsTable rows={list} onOpen={onOpen} showWhen />
          {data?.has_more && (
            <p className="mono mt-4 text-center text-[11px] text-dim">
              Showing the latest 50. Older entries remain available through pagination.
            </p>
          )}
        </>
      )}
    </PanelFrame>
  )
}

/* ---------------------------------------------------------------- settings */

export function SettingsPanel() {
  return (
    <PanelFrame title="Settings" subtitle="What Outpath stores about you, and how requests are sent.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="p-6">
          <span className="icon-chip">
            <Server size={18} strokeWidth={1.75} />
          </span>
          <p className="mt-5 text-[15px] font-semibold text-text">Request execution</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            A request is sent either through Outpath's controlled server execution path or, for local/private
            targets, directly from your browser using Local Network Access. Server requests are validated before
            connection and redirects are re-checked per hop.
          </p>
        </Card>

        <Card padding="p-6">
          <span className="icon-chip">
            <ShieldCheck size={18} strokeWidth={1.75} />
          </span>
          <p className="mt-5 text-[15px] font-semibold text-text">What Outpath stores</p>
          <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-muted">
            <li>Saved requests, collections and environments, scoped to your account.</li>
            <li>History entries: method, URL, status and duration.</li>
            <li>
              Not stored in request history: authorization credentials or environment secret values. Saved request configurations remain scoped to your account.
            </li>
          </ul>
        </Card>
      </div>
    </PanelFrame>
  )
}
