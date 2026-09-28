import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Chrome, Code2, Gauge, Globe2, Layers3, Lock, Network, ShieldCheck, Terminal, Workflow } from 'lucide-react'
import { motion } from 'framer-motion'
import Navbar from '@/components/Navbar'
import SiteFooter from '@/components/SiteFooter'
import { Button, cx } from '@/components/ui'

const blocks = {
  product: {
    eyebrow: 'OUTPATH · PRODUCT',
    title: 'One workspace for the request that matters right now.',
    lede: 'Build the request, control auth and environments, run it, inspect the real response and turn the result into a repeatable check.',
  },
  features: {
    eyebrow: 'OUTPATH · FEATURES',
    title: 'The useful parts of API testing, without the clutter.',
    lede: 'Collections, environments, variables, auth, assertions, history and a response viewer designed around one fast request loop.',
  },
  security: {
    eyebrow: 'OUTPATH · SECURITY',
    title: 'Built to send requests, not become a proxy by accident.',
    lede: 'Server-side requests are bounded by URL validation, private-range checks, timeouts and account ownership. Local requests stay in the user’s browser.',
  },
  docs: {
    eyebrow: 'OUTPATH · DOCS',
    title: 'Start with one request. Then build from there.',
    lede: 'Use public APIs anywhere. For localhost and private-network APIs, use desktop Chrome 142+ or Edge 143+ with Local Network Access enabled.',
  },
}

function Shell({ type, children }) {
  const m = blocks[type]
  return (
    <div className="min-h-screen bg-ink">
      <Navbar />
      <main className="pt-28 sm:pt-32">
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20 md:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow mb-5"><span className="eyebrow-dot" /> {m.eyebrow}</p>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="display text-[clamp(2.4rem,6vw,4.8rem)]">
              {m.title}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-muted">
              {m.lede}
            </motion.p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/signup"><Button size="lg" variant="premium">Start testing <ArrowRight size={16} /></Button></Link>
              <Link to="/"><Button size="lg" variant="outline"><ArrowLeft size={16} /> Back home</Button></Link>
            </div>
          </div>
        </section>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

function StatCard({ icon: Icon, title, body }) {
  return <div className="card-premium p-6"><span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/30 bg-accent/[0.07] text-accent"><Icon size={17} /></span><h3 className="mt-4 text-[15px] font-semibold text-text">{title}</h3><p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p></div>
}

export function ProductPage() {
  return <Shell type="product">
    <section className="mx-auto max-w-6xl px-5 pb-24"><div className="grid gap-4 md:grid-cols-3"><StatCard icon={Workflow} title="Request first" body="The request builder stays central: params, headers, auth, body and assertions all live on the same path."/><StatCard icon={Gauge} title="Response first" body="Status, latency, size, headers and payload are shown from the real response, not a simulated success state."/><StatCard icon={Layers3} title="Replayable work" body="Save requests into collections, switch environments, inspect history and send the same request again."/></div></section>
  </Shell>
}

export function FeaturesPage() {
  const rows = [
    ['Collections', 'Organize requests the way your services are organized.', Code2],
    ['Environments', 'Switch values without editing every request.', Layers3],
    ['Authentication', 'Bearer, basic auth and API keys stay attached to the request or environment.', Lock],
    ['Assertions', 'Turn status, fields and latency into explicit PASS / FAIL results.', Check],
    ['Local APIs', 'Use browser LNA for localhost and private targets on supported Chromium browsers.', Network],
    ['AI diagnosis', 'Ask Groq to explain a failed request from safe, redacted request metadata.', Gauge],
  ]
  return <Shell type="features"><section className="mx-auto max-w-6xl px-5 pb-24"><div className="grid gap-3 md:grid-cols-2">{rows.map(([t,b,I]) => <div key={t} className="card-premium flex gap-4 p-6"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent/[0.05] text-accent"><I size={17}/></span><div><h3 className="text-[15px] font-semibold text-text">{t}</h3><p className="mt-2 text-[13px] leading-relaxed text-muted">{b}</p></div></div>)}</div></section></Shell>
}

export function SecurityPage() {
  return <Shell type="security"><section className="mx-auto max-w-6xl px-5 pb-24"><div className="grid gap-4 lg:grid-cols-2"><div className="panel-premium p-7"><p className="eyebrow mb-4"><span className="eyebrow-dot"/> Request boundaries</p><div className="space-y-4">{['Validate scheme and URL before execution','Block private / loopback targets on server-side requests','Apply request timeouts and response limits','Keep account data scoped to the authenticated user'].map((x)=> <div key={x} className="flex items-start gap-3 border-b border-line pb-4 last:border-0 last:pb-0"><Check size={15} className="mt-0.5 text-pass"/><span className="text-[13px] leading-relaxed text-text">{x}</span></div>)}</div></div><div className="panel-premium p-7"><p className="eyebrow mb-4"><span className="eyebrow-dot"/> Local request model</p><p className="text-[14px] leading-relaxed text-muted">Local requests do not pass through the Outpath server. The browser connects directly to the target after Local Network Access permission is granted, so the user’s localhost remains local to their machine.</p><div className="mt-6 grid gap-2"><div className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-4 py-3"><Chrome size={16}/><span className="text-[13px] text-text">Chrome 142+</span><span className="mono ml-auto text-[10px] text-pass">SUPPORTED</span></div><div className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-4 py-3"><Globe2 size={16}/><span className="text-[13px] text-text">Edge 143+</span><span className="mono ml-auto text-[10px] text-pass">SUPPORTED</span></div></div></div></div></section></Shell>
}

export function DocsPage() {
  return <Shell type="docs"><section className="mx-auto grid max-w-6xl gap-4 px-5 pb-24 lg:grid-cols-[1.1fr_.9fr]"><div className="panel-premium p-7"><p className="eyebrow mb-4"><span className="eyebrow-dot"/> Quick start</p><ol className="space-y-5">{[
    ['Create a request','Choose a method and enter the target URL.'],
    ['Configure it','Add params, headers, auth, body and assertions.'],
    ['Send it','Public targets use the normal request path.'],
    ['Go local','For localhost/private targets, use desktop Chrome 142+ or Edge 143+ and allow LNA when prompted.'],
    ['Inspect + diagnose','Read the response, assertions and optional Groq explanation.'],
  ].map(([t,b],i)=><li key={t} className="flex gap-4"><span className="mono mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-[11px] text-muted">0{i+1}</span><div><h3 className="text-[14px] font-semibold text-text">{t}</h3><p className="mt-1 text-[13px] leading-relaxed text-muted">{b}</p></div></li>)}</ol></div><div className="panel-premium p-7"><p className="eyebrow mb-4"><span className="eyebrow-dot"/> Local browser requirements</p><div className="space-y-3 text-[13px] leading-relaxed text-muted"><p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 text-accent"/> Outpath must be served over HTTPS.</p><p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 text-accent"/> The local API must allow CORS from the Outpath origin.</p><p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 text-accent"/> Chrome uses the Apps on device / Local Network permission flow for local targets.</p><p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 text-accent"/> Firefox and Safari do not get this local-request path in the current product; public API testing still works normally.</p></div><Link to="/signup" className="mt-7 inline-flex"><Button variant="premium">Open Outpath <ArrowRight size={15}/></Button></Link></div></section></Shell>
}
