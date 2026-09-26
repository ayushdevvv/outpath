import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Navbar from '@/components/Navbar'
import { Button } from '@/components/ui'
import {
  PipelineSection,
  BuilderSection,
  ResponseSection,
  AssertionSection,
  WorkflowSection,
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
        <span className="ob-word text-[18px] animate-pulse"><span className="ob-o">O</span><span className="ob-b">P</span></span>
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
    <section className="relative overflow-hidden bg-ink pt-28 sm:pt-32">
      <div className="pointer-events-none absolute inset-0 grid-floor opacity-30" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(55% 40% at 50% 38%, rgba(34,197,94,0.12), transparent 70%)',
        }}
      />

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
          Build requests. Route them through <span className="text-text">OP</span>. Inspect every response.
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

function Footer() {
  return (
    <footer className="hairline mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-muted">
          <span className="ob-word text-[17px] text-text"><span className="ob-o">O</span><span className="ob-b">P</span></span>
        </div>
        <p className="mono text-[11px] text-muted">
          Requests leave your browser, pass through Outpath, and come back measured.
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
        <SecuritySection />
        <ClosingSection />
      </main>
      <Footer />
    </div>
  )
}
