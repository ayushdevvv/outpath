import { motion } from 'framer-motion'
import { Check, Minus, X } from 'lucide-react'
import { cx } from './ui'

export const STAGES = [
  { id: 'request', label: 'Request' },
  { id: 'auth', label: 'Auth' },
  { id: 'outbox', label: 'Outbox' },
  { id: 'server', label: 'Server' },
  { id: 'assertions', label: 'Assertions' },
  { id: 'response', label: 'Response' },
]

const TONE = {
  idle: { text: 'text-muted', ring: 'border-line', bar: '#243036' },
  active: { text: 'text-hold', ring: 'border-hold/50', bar: '#F2B84B', glow: '0 0 0 1px rgba(242,184,75,0.12), 0 0 34px -10px rgba(242,184,75,0.5)' },
  ok: { text: 'text-pass', ring: 'border-pass/40', bar: '#34D399', glow: '0 0 30px -12px rgba(52,211,153,0.55)' },
  warn: { text: 'text-hold', ring: 'border-hold/50', bar: '#F2B84B' },
  failed: { text: 'text-fail', ring: 'border-fail/50', bar: '#F5657A' },
  skipped: { text: 'text-muted/50', ring: 'border-line', bar: '#1A2226' },
}

function Glyph({ state }) {
  if (state === 'ok') return <Check size={12} strokeWidth={3} />
  if (state === 'failed') return <X size={12} strokeWidth={3} />
  if (state === 'skipped') return <Minus size={12} strokeWidth={3} />
  if (state === 'active')
    return <span className="block h-1.5 w-1.5 animate-pulse rounded-full bg-hold" />
  return <span className="block h-1 w-1 rounded-full bg-current opacity-50" />
}

/**
 * `stages` is [{ id, label, state, detail }] where state is one of
 * idle | active | ok | warn | failed | skipped.
 * Nothing here invents a value — `detail` is whatever the caller measured.
 */
export default function OutboxPipeline({ stages, note, premium = false }) {
  return (
    <div className="w-full">
      <ol className="flex min-w-full gap-2 overflow-x-auto pb-2 md:gap-3">
        {stages.map((stage, i) => {
          const tone = TONE[stage.state] || TONE.idle
          const next = stages[i + 1]
          return (
            <li key={stage.id} className="flex min-w-0 flex-1 shrink-0 items-center gap-2 md:gap-3">
              <div
                className={cx(
                  'min-w-[7.5rem] flex-1 rounded-xl border px-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-all duration-300',
                  premium ? 'stage-premium py-3.5' : 'bg-black/20 py-2.5',
                  tone.ring,
                )}
                style={premium && tone.glow ? { boxShadow: tone.glow } : undefined}
              >
                <div className={cx('flex items-center gap-2', tone.text)}>
                  <span
                    className={cx(
                      'flex h-5 w-5 items-center justify-center rounded-full border bg-black/20',
                      tone.ring,
                    )}
                  >
                    <Glyph state={stage.state} />
                  </span>
                  <span className="mono truncate text-[11px] font-medium tracking-wide">
                    {stage.label}
                  </span>
                </div>
                <p className="mono mt-1.5 truncate text-[11px] text-muted" title={stage.detail || ''}>
                  {stage.detail || '—'}
                </p>
              </div>

              {next && (
                <div className="relative h-px w-5 shrink-0 bg-line md:w-8">
                  <motion.span
                    className="absolute inset-y-0 left-0 block"
                    style={{ background: tone.bar }}
                    initial={{ width: 0 }}
                    animate={{ width: stage.state === 'idle' || stage.state === 'skipped' ? 0 : '100%' }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {note && <p className="mono mt-2 text-[11px] text-muted">{note}</p>}
    </div>
  )
}

/** Derive pipeline stage states from a real run. Stops at the first failure. */
export function stagesFromRun({ phase, request, result, assertions, error, local = false }) {
  const idle = STAGES.map((s) => ({ ...s, state: 'idle', detail: '' }))
  if (phase === 'idle') return idle

  const out = idle.map((s) => ({ ...s }))
  const fail = (index, detail) => {
    out[index] = { ...out[index], state: 'failed', detail }
    for (let i = index + 1; i < out.length; i++) out[i] = { ...out[i], state: 'skipped', detail: '' }
    return out
  }

  out[0] = { ...out[0], state: 'ok', detail: `${request.method} ${shortPath(request.url)}` }
  out[1] = {
    ...out[1],
    state: 'ok',
    detail: request.auth?.type && request.auth.type !== 'none' ? request.auth.type : 'none',
  }

  if (phase === 'sending') {
    out[2] = { ...out[2], state: 'active', detail: local ? 'local bridge' : 'outbox server' }
    return out
  }

  out[2] = { ...out[2], state: 'ok', detail: local ? 'local bridge' : 'outbox server' }

  if (error) return fail(3, error)

  out[3] = { ...out[3], state: 'ok', detail: `${result.status} · ${result.durationMs}ms` }

  if (!assertions || assertions.length === 0) {
    out[4] = { ...out[4], state: 'skipped', detail: 'none defined' }
  } else {
    const failed = assertions.find((a) => a.verdict === 'FAIL')
    if (failed) {
      return fail(4, `${failed.label} — got ${failed.actual}`)
    }
    const passed = assertions.filter((a) => a.verdict === 'PASS').length
    out[4] = { ...out[4], state: 'ok', detail: `${passed}/${assertions.length} passed` }
  }

  out[5] = { ...out[5], state: 'ok', detail: `${result.status} · ${result.sizeLabel}` }
  return out
}

function shortPath(url) {
  try {
    return new URL(url).pathname || '/'
  } catch {
    return url?.slice(0, 28) || '—'
  }
}
