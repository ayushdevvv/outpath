import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  FolderTree,
  Gauge,
  History as HistoryIcon,
  Layers,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Timer,
  Trash2,
  TrendingUp,
  Zap,
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

const METHOD_HEX = {
  GET: 'var(--pass)',
  POST: 'var(--accent)',
  PUT: 'var(--hold)',
  PATCH: 'var(--hold)',
  DELETE: 'var(--fail)',
}

const STATUS_CLASS_META = {
  '2xx': { label: '2xx · OK', color: 'var(--pass)' },
  '3xx': { label: '3xx · Redirect', color: 'var(--hold)' },
  '4xx': { label: '4xx · Client', color: 'var(--fail)' },
  '5xx': { label: '5xx · Server', color: '#e64980' },
  failed: { label: 'Failed', color: 'var(--dim)' },
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function lastNDayLabels(n) {
  const out = []
  const today = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(DAY_LABELS[d.getDay()])
  }
  return out
}

/** Premium dual-metric area chart: request volume as a filled area, avg latency as an overlaid line. */
function TrafficChart({ daily, dailyAvgMs }) {
  const w = 640
  const h = 200
  const padX = 10
  const padTop = 16
  const padBottom = 26
  const n = daily.length
  const labels = lastNDayLabels(n)
  const peak = Math.max(1, ...daily)
  const msVals = dailyAvgMs.filter((v) => v != null)
  const msPeak = Math.max(1, ...msVals)
  const msFloor = msVals.length ? Math.min(...msVals) : 0

  const stepX = n > 1 ? (w - padX * 2) / (n - 1) : 0
  const yFor = (v) => padTop + (1 - v / peak) * (h - padTop - padBottom)
  const points = daily.map((v, i) => [padX + i * stepX, yFor(v)])

  const areaPath =
    points.length > 0
      ? `M${points[0][0]},${h - padBottom} ` +
        points.map(([x, y]) => `L${x},${y}`).join(' ') +
        ` L${points[points.length - 1][0]},${h - padBottom} Z`
      : ''
  const linePath = points.length > 0 ? `M${points.map(([x, y]) => `${x},${y}`).join(' L')}` : ''

  const msYFor = (v) => {
    if (v == null) return null
    const span = msPeak - msFloor || 1
    return padTop + (1 - (v - msFloor) / span) * (h - padTop - padBottom) * 0.55 - 4
  }
  const msPoints = dailyAvgMs.map((v, i) => (v == null ? null : [padX + i * stepX, msYFor(v)]))
  const msSegments = []
  let seg = []
  msPoints.forEach((p, i) => {
    if (p) {
      seg.push(p)
    } else if (seg.length) {
      msSegments.push(seg)
      seg = []
    }
    if (i === msPoints.length - 1 && seg.length) msSegments.push(seg)
  })

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full sm:h-48" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={w - padX}
          y1={padTop + f * (h - padTop - padBottom)}
          y2={padTop + f * (h - padTop - padBottom)}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      {areaPath && <path d={areaPath} fill="url(#trafficFill)" />}
      {linePath && <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {msSegments.map((s, i) => (
        <path
          key={i}
          d={`M${s.map(([x, y]) => `${x},${y}`).join(' L')}`}
          fill="none"
          stroke="var(--hold)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeLinecap="round"
          opacity="0.85"
        />
      ))}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={daily[i] ? 3 : 0} fill="var(--ink)" stroke="var(--accent)" strokeWidth="1.75" />
      ))}
      {labels.map((label, i) => (
        <text
          key={i}
          x={padX + i * stepX}
          y={h - 6}
          textAnchor="middle"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
          fill="var(--dim)"
        >
          {label}
        </text>
      ))}
    </svg>
  )
}

/** Compact ring chart for method / status distribution. */
function DonutChart({ segments, size = 112, thickness = 13 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} />
      {segments.map((seg, i) => {
        const frac = seg.value / total
        const dash = frac * c
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap={segments.length > 1 ? 'butt' : 'round'}
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}

const uid = () => Math.random().toString(36).slice(2, 9)


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



export function OverviewPanel({ onOpen, onNavigate, onNewRequest }) {
  const { status, data, error, reload } = useResource('/api/overview')
  const view = data
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = (user?.name || user?.email || '').split(/[ @]/)[0]
  const daily = view?.daily_sends || []
  const dailyAvgMs = view?.daily_avg_ms || []
  const isNewUser = status === 'ready' && !view.request_count && !view.history_count

  const methodSegments = useMemo(
    () =>
      (view?.method_breakdown || []).map((m) => ({
        label: m.method,
        value: m.count,
        color: METHOD_HEX[m.method] || 'var(--dim)',
      })),
    [view?.method_breakdown],
  )
  const statusSegments = useMemo(
    () =>
      (view?.status_breakdown || []).map((s) => {
        const key = s.class_ ?? s.class
        const meta = STATUS_CLASS_META[key]
        return {
          label: meta?.label || key,
          value: s.count,
          color: meta?.color || 'var(--dim)',
        }
      }),
    [view?.status_breakdown],
  )
  const statusTotal = statusSegments.reduce((s, seg) => s + seg.value, 0)

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
              {
                icon: FolderTree,
                target: 'collections',
                label: 'Requests saved',
                value: view.request_count,
                sub: `${view.environment_count} environments`,
              },
              {
                icon: Send,
                target: 'history',
                label: 'Sends',
                value: view.history_count,
                sub: `${view.sends_last_7d ?? 0} in last 7d`,
              },
              {
                icon: Check,
                target: 'history',
                label: 'Success rate',
                value: view.success_rate == null ? '—' : `${view.success_rate}%`,
                sub: 'responses 2xx–3xx',
              },
              {
                icon: Timer,
                target: 'history',
                label: 'Avg latency',
                value: view.avg_duration_ms == null ? '—' : view.avg_duration_ms,
                unit: view.avg_duration_ms == null ? '' : 'ms',
                sub:
                  view.fastest_ms == null
                    ? 'across all sends'
                    : `${view.fastest_ms}–${view.slowest_ms} ms range`,
              },
            ].map((s, i) => (
              <button
                key={s.label}
                onClick={() => onNavigate(s.target)}
                className="app-card app-card-hover animate-fade-up p-5 text-left"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="icon-chip">
                  <s.icon size={17} strokeWidth={1.75} />
                </span>
                <p className="mt-5 truncate text-[13px] font-medium text-muted">{s.label}</p>
                <p className="mt-1.5 flex items-baseline gap-1 text-[26px] font-bold leading-none tracking-tightest text-text sm:text-[30px]">
                  {s.value}
                  {s.unit && <span className="text-[12.5px] font-medium text-muted">{s.unit}</span>}
                </p>
                <p className="mono mt-3 truncate text-[11px] text-dim">{s.sub}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="app-card min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tightest text-text">
                    <TrendingUp size={15} className="text-accent" /> Traffic · last 7 days
                  </h2>
                  <p className="mt-1 text-[12px] text-dim">Sends volume against average response time</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[22px] font-bold leading-none tracking-tightest text-text">{view.sends_last_7d}</p>
                    <p className="mono mt-1 text-[10px] text-dim">sends</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-1.5 w-3 rounded-full bg-accent" /> volume
                    </span>
                    <span className="flex items-center gap-1.5 text-muted">
                      <span className="h-px w-3 border-t border-dashed border-hold" /> latency
                    </span>
                  </div>
                </div>
              </div>
              {daily.some((n) => n > 0) ? (
                <div className="mt-4">
                  <TrafficChart daily={daily} dailyAvgMs={dailyAvgMs} />
                </div>
              ) : (
                <div className="mt-6 flex h-40 items-center justify-center rounded-xl border border-dashed border-line text-[12.5px] text-dim">
                  No traffic yet this week
                </div>
              )}
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <p className="mono text-[10px] uppercase tracking-wide text-dim">Fastest</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-pass">
                    <Zap size={12} /> {view.fastest_ms ?? '—'}
                    {view.fastest_ms != null && <span className="text-[11px] font-medium text-muted">ms</span>}
                  </p>
                </div>
                <div>
                  <p className="mono text-[10px] uppercase tracking-wide text-dim">Average</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-text">
                    <Gauge size={12} className="text-accent" /> {view.avg_duration_ms ?? '—'}
                    {view.avg_duration_ms != null && <span className="text-[11px] font-medium text-muted">ms</span>}
                  </p>
                </div>
                <div>
                  <p className="mono text-[10px] uppercase tracking-wide text-dim">Slowest</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-fail">
                    <Timer size={12} /> {view.slowest_ms ?? '—'}
                    {view.slowest_ms != null && <span className="text-[11px] font-medium text-muted">ms</span>}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="app-card p-5">
                <h2 className="text-[13.5px] font-semibold tracking-tightest text-text">Methods</h2>
                {methodSegments.length ? (
                  <div className="mt-4 flex items-center gap-4">
                    <DonutChart segments={methodSegments} />
                    <ul className="min-w-0 flex-1 space-y-1.5">
                      {methodSegments.map((seg) => (
                        <li key={seg.label} className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="mono flex items-center gap-1.5 truncate text-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: seg.color }} />
                            {seg.label}
                          </span>
                          <span className="mono shrink-0 text-text">{seg.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-4 text-[12px] text-dim">No sends yet.</p>
                )}
              </div>

              <div className="app-card p-5">
                <h2 className="text-[13.5px] font-semibold tracking-tightest text-text">Status codes</h2>
                {statusSegments.length ? (
                  <ul className="mt-4 space-y-3">
                    {statusSegments.map((seg) => (
                      <li key={seg.label}>
                        <div className="flex items-center justify-between text-[11.5px]">
                          <span className="flex items-center gap-1.5 text-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: seg.color }} />
                            {seg.label}
                          </span>
                          <span className="mono text-text">{seg.value}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(seg.value / statusTotal) * 100}%`, background: seg.color }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[12px] text-dim">No sends yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 min-w-0">
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
        </>
      )}
    </PanelFrame>
  )
}



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
