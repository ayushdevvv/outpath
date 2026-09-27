import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Chrome, Globe2, ShieldCheck } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { Button } from '@/components/ui'
import {
  PipelineSection,
  BuilderSection,
  ResponseSection,
  AssertionSection,
  WorkflowSection,
  LocalAccessSection,
  SecuritySection,
  ClosingSection,
} from './sections'

// The hero visual is a plain 2D canvas now — no separate heavy chunk to
// lazy-load, so it can mount directly.
import HeroFlow from '@/hero/HeroFlow'

/* ------------------------------------------------------------ glass cards */
/* The two readouts stay locked to the product flow, not the viewport,
   so they reinforce the request lifecycle at every screen size. */

function GlassCard({ className, delay = 0, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.7, ease: [0.2, 0.7, 0.3, 1] }}
      className={`glass pointer-events-none absolute hidden rounded-xl p-3 shadow-lift sm:block ${className}`}
    >
      {children}
    </motion.div>
  )
}

function HeroCards() {
  return (
    <>
      <GlassCard className="left-0 top-[30%] w-44 sm:w-48" delay={1.05}>
        <div className="mono flex items-baseline gap-2 text-[12px]">
          <span className="text-accent">GET</span>
          <span className="truncate text-text">/api/users</span>
        </div>
        <div className="mono mt-2 flex items-center gap-3 text-[11px] text-muted">
          <span className="text-pass">200 OK</span>
          <span>142 ms</span>
        </div>
      </GlassCard>

      <GlassCard className="right-0 top-[8%] w-44 sm:w-48" delay={1.3}>
        <p className="mono text-[11px] text-pass">200 OK</p>
        <p className="mt-1 text-[12px] text-text">Verified response</p>
      </GlassCard>
    </>
  )
}

/* ------------------------------------------------------------------- hero */

function SceneFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex items-center gap-2 text-muted">
        <span className="ob-word text-[16px] animate-pulse"><span className="ob-o">OUT</span><span className="ob-b">PATH</span></span>
        <span className="mono text-[11px]">Loading flow</span>
      </div>
    </div>
  )
}

function Hero() {
  const [mounted, setMounted] = useState(false)

  // Defer the canvas by a frame so text paints first on slow devices.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <section className="relative overflow-hidden bg-ink pt-36 sm:pt-40 md:pt-44">
      <div className="pointer-events-none absolute inset-0 grid-floor opacity-30" />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-5 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.2, 0.7, 0.3, 1] }}
          className="ob-word select-none text-[clamp(3.6rem,12vw,7.2rem)] leading-[0.72] drop-shadow-[0_0_44px_rgba(34,197,94,0.18)]"
        >
          <span className="ob-o">OUT</span><span className="ob-b">PATH</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7 }}
          className="mx-auto mt-5 max-w-[58ch] text-[13px] leading-relaxed text-muted sm:text-[15px]"
        >
          Build requests. Send them anywhere. Inspect every response.
        </motion.p>

        {/* ------------------------------------------------------ request flow */}
        <div className="relative -mt-1 h-[225px] w-full sm:mt-1 sm:h-[290px] md:h-[330px]">
          {mounted ? <HeroFlow /> : <SceneFallback />}
          <HeroCards />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.7 }}
          className="mb-16 mt-2 sm:mb-24 sm:mt-3"
        >
          <Link to="/signup">
            <Button size="lg" variant="premium" className="min-w-[156px]">
              Start testing <ArrowRight size={16} />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- footer */


function BrowserSupportStrip() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-8">
      <div className="panel-premium grid gap-6 p-6 md:grid-cols-[1.25fr_1fr] md:items-center md:p-7">
        <div>
          <p className="eyebrow mb-4"><span className="eyebrow-dot" /> Local API access</p>
          <h2 className="display text-2xl sm:text-3xl">Public APIs everywhere. Local APIs where the browser supports it.</h2>
          <p className="mt-3 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Outpath uses browser Local Network Access for localhost and private-network requests. Today that means desktop Chrome 142+ and Edge 143+; public API requests do not depend on this capability.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-1">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-3">
            <Chrome size={17} className="text-text" /><span className="text-[13px] text-text">Chrome 142+</span><span className="mono ml-auto text-[10px] text-pass">LOCAL</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-3">
            <Globe2 size={17} className="text-text" /><span className="text-[13px] text-text">Edge 143+</span><span className="mono ml-auto text-[10px] text-pass">LOCAL</span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-black/20 px-3 py-3">
            <ShieldCheck size={17} className="text-accent" /><span className="text-[13px] text-text">CORS + permission</span><span className="mono ml-auto text-[10px] text-muted">REQUIRED</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="hairline mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-muted">
          <span className="ob-word text-[16px]"><span className="ob-o">OUT</span><span className="ob-b">PATH</span></span>
        </div>
        <p className="mono text-[11px] text-muted">
          Public requests use Outpath’s server path. Local requests stay in your browser.
        </p>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="bg-ink">
      <Navbar />
      <main>
        <Hero />
        <PipelineSection />
        <BuilderSection />
        <ResponseSection />
        <AssertionSection />
        <WorkflowSection />
        <LocalAccessSection />
        <SecuritySection />
        <BrowserSupportStrip />
        <ClosingSection />
      </main>
      <Footer />
    </div>
  )
}
