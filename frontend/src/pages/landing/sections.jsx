import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion'
import {
  ArrowRight,
  Boxes,
  Check,
  Clock,
  FileJson,
  FolderTree,
  History,
  KeyRound,
  Lock,
  Chrome,
  Globe2,
  ShieldCheck,
  Variable,
} from 'lucide-react'
import { Badge, Button, Dot, cx } from '@/components/ui'
import OutpathPipeline, { STAGES } from '@/components/OutpathPipeline'



function Section({ id, eyebrow, title, lede, children, className }) {
  return (
    <section id={id} className={cx('relative mx-auto max-w-6xl px-5 py-24 md:py-32', className)}>
      <div className="section-rule" />
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            {eyebrow}
          </p>
        )}
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-15%' }}
          transition={{ duration: 0.7, ease: [0.2, 0.7, 0.3, 1] }}
          className="display h2-premium text-[clamp(1.9rem,4.4vw,3rem)]"
        >
          {title}
        </motion.h2>
        {lede && <p className="mt-4 max-w-[58ch] text-[15px] leading-relaxed text-muted">{lede}</p>}
      </div>
      <div className="mt-12">{children}</div>
    </section>
  )
}

function Panel({ className, children }) {
  return <div className={cx('panel-premium', className)}>{children}</div>
}



const SCROLL_DETAIL = [
  'POST /api/orders',
  'bearer · {{token}}',
  'outpath server',
  '201 · 183ms',
  '3/3 passed',
  '201 · 4.2 KB',
]


function DatabaseCore({ scrollYProgress }) {
  const packetCx = useTransform(scrollYProgress, [0.42, 0.56, 0.7, 0.86], [80 - 54, 80, 80, 80 + 54])
  const packetOpacity = useTransform(scrollYProgress, [0.38, 0.46, 0.82, 0.9], [0, 1, 1, 0])
  const coreOpacity = useTransform(scrollYProgress, [0.42, 0.56, 0.7, 0.86], [0.35, 1, 1, 0.35])
  const coreScale = useTransform(scrollYProgress, [0.42, 0.56, 0.7, 0.86], [0.85, 1.12, 1.12, 0.85])

  return (
    <div className="flex flex-col items-center border-t border-white/[0.06] pt-8">
      <div className="relative h-40 w-full max-w-[220px]">
        <svg viewBox="0 0 160 140" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id="dbCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.95" />
              <stop offset="55%" stopColor="#22C55E" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
            </radialGradient>
          </defs>

          
          <motion.circle
            cx="80"
            cy="65"
            r="30"
            fill="url(#dbCoreGlow)"
            style={{ opacity: coreOpacity, scale: coreScale }}
          />

          
          <g className="origin-center animate-spin-slow" style={{ transformBox: 'fill-box' }}>
            <ellipse cx="80" cy="55" rx="46" ry="13" fill="none" stroke="#334049" strokeWidth="0.75" opacity="0.55" />
            <ellipse cx="80" cy="75" rx="46" ry="13" fill="none" stroke="#334049" strokeWidth="0.75" opacity="0.55" />
            <path d="M34 28 L34 100" stroke="#243036" strokeWidth="1" />
            <path d="M126 28 L126 100" stroke="#243036" strokeWidth="1" />
          </g>

          
          <ellipse cx="80" cy="28" rx="46" ry="13" fill="none" stroke="#22C55E" strokeOpacity="0.4" strokeWidth="1.2" />
          <ellipse cx="80" cy="100" rx="46" ry="13" fill="none" stroke="#22C55E" strokeOpacity="0.22" strokeWidth="1" />
          <path d="M34 28 L34 100" stroke="#22C55E" strokeOpacity="0.18" strokeWidth="1" />
          <path d="M126 28 L126 100" stroke="#22C55E" strokeOpacity="0.18" strokeWidth="1" />

          
          <motion.circle cy="65" r="4" fill="#3ADB8C" style={{ cx: packetCx, opacity: packetOpacity }} />
        </svg>
      </div>
      <p className="mono mt-2 text-[11px] text-muted">Server datastore · request lands, response leaves</p>
    </div>
  )
}

export function PipelineSection() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 45%'] })
  const [reached, setReached] = useState(0)

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setReached(Math.min(STAGES.length, Math.round(v * STAGES.length)))
  })

  const stages = STAGES.map((s, i) => ({
    ...s,
    state: i < reached ? 'ok' : i === reached ? 'active' : 'idle',
    detail: i <= reached ? SCROLL_DETAIL[i] : '',
  }))

  return (
    <div ref={ref}>
      <Section
        id="pipeline"
        eyebrow="01 · Pipeline"
        title="One pipeline. Complete visibility."
        lede="Every request walks the same six stages. When something breaks, the pipeline stops where it broke instead of handing you a red toast and a shrug."
      >
        <Panel className="p-5 md:p-7">
          <OutpathPipeline stages={stages} premium />
          <div className="mt-8">
            <DatabaseCore scrollYProgress={scrollYProgress} />
          </div>
        </Panel>
        <p className="mono mt-4 text-[11px] text-muted">Scroll to advance the run.</p>
      </Section>
    </div>
  )
}



const HEADERS = [
  ['Content-Type', 'application/json'],
  ['Authorization', 'Bearer {{token}}'],
]

export function BuilderSection() {
  const [method, setMethod] = useState('POST')
  const [sending, setSending] = useState(false)

  return (
    <Section
      id="builder"
      eyebrow="02 · Builder"
      title="API testing without the clutter."
      lede="Method, URL, headers, auth, body. The controls you use on every request stay on screen; everything else gets out of the way."
    >
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="flex rounded-lg border border-line bg-black/30 p-0.5">
            {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cx(
                  'mono rounded-md px-2.5 py-1 text-[11px] transition',
                  m === method ? 'bg-white/10 text-text' : 'text-muted hover:text-text',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="mono min-w-0 flex-1 truncate rounded-lg border border-line bg-black/30 px-3 py-1.5 text-[12px]">
            <span className="text-muted">{'{{base_url}}'}</span>
            <span className="text-text">/api/orders</span>
          </div>
          <Button
            size="sm"
            busy={sending}
            onClick={() => {
              setSending(true)
              setTimeout(() => setSending(false), 900)
            }}
          >
            {sending ? 'Sending' : 'Send'}
          </Button>
        </div>

        <div className="grid gap-px bg-line md:grid-cols-2">
          <div className="bg-panel p-4">
            <p className="text-[13px] font-medium text-muted">Headers</p>
            <table className="mono mt-3 w-full text-[12px]">
              <tbody>
                {HEADERS.map(([k, v]) => (
                  <tr key={k} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 text-muted">{k}</td>
                    <td className="py-2 text-text">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-5 text-[13px] font-medium text-muted">Authentication</p>
            <div className="mono mt-2 flex items-center gap-2 text-[12px]">
              <Badge tone="accent">
                <KeyRound size={11} /> bearer
              </Badge>
              <span className="text-muted">{'{{token}}'}</span>
            </div>
          </div>

          <div className="bg-panel p-4">
            <p className="text-[13px] font-medium text-muted">Body</p>
            <pre className="mono mt-3 overflow-x-auto text-[12px] leading-relaxed text-text">
{`{
  "sku": "RLY-204",
  "quantity": 2,
  "customer_id": "{{user_id}}"
}`}
            </pre>
          </div>
        </div>
      </Panel>
    </Section>
  )
}



export function ResponseSection() {
  return (
    <Section
      id="response"
      eyebrow="03 · Response"
      title="See what happened."
      lede="Status, latency and size come from the request that just ran. Nothing on this screen is an estimate."
    >
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
          <span className="mono text-sm text-pass">200 OK</span>
          <span className="mono text-[12px] text-muted">183 ms</span>
          <span className="mono text-[12px] text-muted">4.2 KB</span>
          <Badge tone="pass" className="ml-auto">
            <Check size={11} /> 3 assertions passed
          </Badge>
        </div>
        <pre className="mono overflow-x-auto p-4 text-[12px] leading-relaxed">
<span className="text-muted">{'{'}</span>{`
  `}<span className="text-accent">"order"</span>: <span className="text-muted">{'{'}</span>{`
    `}<span className="text-accent">"id"</span>: <span className="text-pass">"ord_8f21"</span>,{`
    `}<span className="text-accent">"status"</span>: <span className="text-pass">"confirmed"</span>,{`
    `}<span className="text-accent">"total_cents"</span>: <span className="text-hold">4980</span>{`
  `}<span className="text-muted">{'}'}</span>,{`
  `}<span className="text-accent">"user"</span>: <span className="text-muted">{'{'}</span> <span className="text-accent">"id"</span>: <span className="text-hold">123</span> <span className="text-muted">{'}'}</span>{`
`}<span className="text-muted">{'}'}</span>
        </pre>
      </Panel>
    </Section>
  )
}



const CHECKS = [
  { name: 'Status', expected: 'Expected 200', actual: 'Received 200', verdict: 'PASS' },
  { name: 'Response', expected: 'user.id exists', actual: 'Found 123', verdict: 'PASS' },
  { name: 'Performance', expected: 'Under 500 ms', actual: '183 ms', verdict: 'PASS' },
  { name: 'Schema', expected: 'order.total_cents is a number', actual: 'Received "4980"', verdict: 'FAIL' },
]

export function AssertionSection() {
  return (
    <Section
      id="assertions"
      eyebrow="04 · Assertions"
      title="Verify every response."
      lede="Write the check once and it runs on every send. A failing assertion shows what it wanted and what it got, side by side."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CHECKS.map((c, i) => {
          const pass = c.verdict === 'PASS'
          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-10%' }}
              transition={{ delay: i * 0.07, duration: 0.5 }}
              className={cx(
                'card-premium p-4',
                pass ? 'border-pass/20' : 'border-fail/35 bg-fail/[0.04]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-text">{c.name}</span>
                <Badge tone={pass ? 'pass' : 'fail'}>{c.verdict}</Badge>
              </div>
              <p className="mono mt-3 text-[11px] text-muted">{c.expected}</p>
              <p className={cx('mono mt-1 text-[11px]', pass ? 'text-text' : 'text-fail')}>
                {c.actual}
              </p>
            </motion.div>
          )
        })}
      </div>
    </Section>
  )
}



const FEATURES = [
  { icon: FolderTree, name: 'Collections', body: 'Group requests into folders that mirror how your service is actually organised.' },
  { icon: Boxes, name: 'Environments', body: 'Local, development and production, each with its own values. Switching changes what gets sent.' },
  { icon: History, name: 'History', body: 'Every send is recorded with its status and duration. Reopen any of them as a live request.' },
  { icon: Variable, name: 'Variables', body: 'Write {{base_url}} once. Outpath resolves it from the environment at send time.' },
  { icon: KeyRound, name: 'Authentication', body: 'Bearer tokens, basic auth and API keys, stored per environment rather than pasted per request.' },
  { icon: Check, name: 'Assertions', body: 'Status, field, value and latency checks that turn a response into a pass or a fail.' },
]

export function WorkflowSection() {
  return (
    <Section
      id="workflow"
      eyebrow="05 · Workflow"
      title="Built for real development workflows."
      lede="The parts you reach for on the fourth day of a project, not just the first."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.name}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-10%' }}
            transition={{ delay: i * 0.05, duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }}
            className="card-premium p-6"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-gradient-to-b from-accent/20 to-accent/5 text-accent shadow-[0_0_24px_-6px_rgba(34,197,94,0.55)]">
              <f.icon size={17} strokeWidth={1.75} />
            </span>
            <h3 className="mt-4 text-[15px] font-medium text-text">{f.name}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  )
}



export function LocalAccessSection() {
  return (
    <Section
      id="local"
      eyebrow="06 · Local APIs"
      title="Your localhost stays on your machine."
      lede="Outpath uses browser Local Network Access for local and private targets. The request goes directly from the supported browser to the local API; Outpath does not proxy that localhost traffic."
    >
      <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
        <Panel className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-black/20 px-3 py-2"><Chrome size={15}/><span className="text-[12px] text-text">Chrome 142+</span><span className="mono text-[10px] text-pass">READY</span></div>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-black/20 px-3 py-2"><Globe2 size={15}/><span className="text-[12px] text-text">Edge 143+</span><span className="mono text-[10px] text-pass">READY</span></div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {['Secure Outpath origin', 'Browser permission', 'Local API CORS'].map((x) => <div key={x} className="rounded-xl border border-line bg-black/15 p-4"><p className="text-[12px] font-semibold text-text">{x}</p><p className="mt-1 text-[11px] leading-relaxed text-muted">One of the three pieces required for a local request to complete.</p></div>)}
          </div>
        </Panel>
        <Panel className="p-6">
          <p className="eyebrow mb-4"><span className="eyebrow-dot"/> Browser-only</p>
          <p className="text-[13px] leading-relaxed text-muted">No extension. No tunnel. No local agent. Public API testing remains available in every normal Outpath environment.</p>
          <Link to="/docs" className="mt-5 inline-flex text-[12px] font-medium text-accent hover:underline">Read local testing docs <ArrowRight size={13} className="ml-1"/></Link>
        </Panel>
      </div>
    </Section>
  )
}



const GUARDS = [
  ['Outbound requests are validated', 'Schemes, ports and resolved IPs are checked before a connection opens, so a URL cannot be pointed at internal infrastructure.'],
  ['Private ranges are refused', 'Loopback, link-local and RFC 1918 addresses never reach the Outpath server — those requests are rejected outright.'],
  ['Every record is owned', 'Collections, environments and history are scoped to your account at the query level, not the view layer.'],
  ['Secrets stay out of logs', 'Tokens, passwords and request bodies are redacted before anything is written down.'],
]

export function SecuritySection() {
  return (
    <Section
      id="security"
      eyebrow="07 · Security"
      title="An Outpath, not an open proxy."
      lede="Outpath makes outbound requests on your behalf, which is exactly the shape of a server-side request forgery bug. These are the constraints that keep it from becoming one."
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
        <Panel className="flex flex-col justify-center gap-3 p-6">
          {[
            ['Your browser', Boxes],
            ['Outpath', ShieldCheck],
            ['Target API', FileJson],
          ].map(([label, Icon], i, arr) => (
            <div key={label}>
              <div className="flex items-center gap-3">
                <span
                  className={cx(
                    'grid h-9 w-9 place-items-center rounded-lg border',
                    i === 1 ? 'border-accent/40 text-accent' : 'border-line text-muted',
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="text-[14px] text-text">{label}</span>
                {i === 1 && (
                  <Badge tone="accent" className="ml-auto">
                    validate · limit · time out
                  </Badge>
                )}
              </div>
              {i < arr.length - 1 && <div className="ml-4 h-6 w-px bg-line" />}
            </div>
          ))}
        </Panel>

        <dl className="grid gap-6 sm:grid-cols-2">
          {GUARDS.map(([term, def]) => (
            <div key={term}>
              <dt className="flex items-start gap-2 text-[14px] font-medium text-text">
                <Lock size={14} className="mt-0.5 shrink-0 text-muted" />
                {term}
              </dt>
              <dd className="mt-2 text-[13px] leading-relaxed text-muted">{def}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}



export function ClosingSection() {
  return (
    <section className="relative px-5 pb-24 pt-8 md:pb-32">
      <div className="panel-premium relative mx-auto max-w-5xl overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-floor opacity-40" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(60% 80% at 50% 115%, rgba(34,197,94,0.3), transparent 70%)' }}
        />
        <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />

        <div className="relative px-6 py-20 text-center md:py-28">
          <p className="eyebrow mb-7">
            <span className="eyebrow-dot" />
            Send · Outpath · Verify
          </p>
          <h2 className="display text-[clamp(2.4rem,7vw,4.4rem)]">
            Send it. Outpath it.
            <br />
            <span className="headline-flare">Verify</span> it.
          </h2>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup">
              <Button size="lg" variant="premium" className="min-w-[176px]">
                Start testing <ArrowRight size={16} />
              </Button>
            </Link>
            <a href="#pipeline">
              <Button size="lg" variant="outline" className="min-w-[176px]">
                See the pipeline
              </Button>
            </a>
          </div>
          <p className="mono mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted">
            <span className="flex items-center gap-2"><Clock size={12} /> Set up in about a minute</span>
            <span>Local API testing · Chrome 142+ / Edge 143+</span>
          </p>
        </div>
      </div>
    </section>
  )
}
