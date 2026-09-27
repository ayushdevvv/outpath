import { useEffect, useRef } from 'react'

/**
 * The hero visual is a flat, flowing signal diagram. Three stations —
 * client, relay, server — joined by braided
 * light-streaks, the way the reference key art reads: motion carried by
 * moving light, not by geometry or gradients. Plain 2D canvas, no three.js:
 * lighter to ship, and easier to make read crisp instead of hazy.
 */

const SIGNAL = '34, 197, 94'
const SIGNAL_SOFT = '52, 211, 153'
const DIM = '86, 105, 108'

// One flowing lane: a base sine wave, offset in phase/amplitude, drawn as
// short moving dashes rather than a filled gradient stroke — the streaks
// read as discrete light rather than a painted wash.
function drawLane(ctx, { x0, x1, y, amp, freq, phase, color, alpha, width, dash, t }) {
  ctx.beginPath()
  const steps = 64
  for (let i = 0; i <= steps; i++) {
    const p = i / steps
    const x = x0 + (x1 - x0) * p
    const y2 = y + Math.sin(p * freq * Math.PI + phase + t) * amp * Math.sin(p * Math.PI)
    if (i === 0) ctx.moveTo(x, y2)
    else ctx.lineTo(x, y2)
  }
  ctx.strokeStyle = `rgba(${color}, ${alpha})`
  ctx.lineWidth = width
  ctx.setLineDash(dash)
  ctx.lineDashOffset = -t * 90
  ctx.stroke()
  ctx.setLineDash([])
}

function drawPad(ctx, x, y, radius, color, pulse) {
  ctx.beginPath()
  ctx.ellipse(x, y, radius, radius * 0.34, 0, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${color}, ${0.5 + pulse * 0.25})`
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x, y, radius * 0.62, radius * 0.21, 0, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(${color}, ${0.06 + pulse * 0.04})`
  ctx.fill()
}

export default function HeroFlow() {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let raf
    let width = 0
    let height = 0
    let visible = true
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const render = (t) => {
      ctx.clearRect(0, 0, width, height)
      const midY = height * 0.56
      const cx = width / 2
      const clientX = width * 0.145
      const serverX = width * 0.855

      // The primary signal stays green throughout: request out, response back.
      const time = reduced ? 0 : t / 1000
      ;[0, 1].forEach((i) => {
        drawLane(ctx, {
          x0: clientX,
          x1: cx,
          y: midY,
          amp: 20 + i * 7,
          freq: 2.4,
          phase: i * 1.3,
          color: SIGNAL,
          alpha: 0.32 - i * 0.1,
          width: 1.3,
          dash: [10, 9],
          t: time * (0.8 + i * 0.15),
        })
        drawLane(ctx, {
          x0: cx,
          x1: serverX,
          y: midY,
          amp: 20 + i * 7,
          freq: 2.4,
          phase: Math.PI + i * 1.3,
          color: SIGNAL,
          alpha: 0.32 - i * 0.1,
          width: 1.3,
          dash: [10, 9],
          t: time * (0.8 + i * 0.15),
        })
      })
      drawLane(ctx, {
        x0: clientX,
        x1: serverX,
        y: midY + 34,
        amp: 12,
        freq: 3.1,
        phase: 2.4,
        color: SIGNAL_SOFT,
        alpha: 0.16,
        width: 1,
        dash: [3, 10],
        t: -time * 0.6,
      })

      const pulse = 0.5 + 0.5 * Math.sin(time * 1.6)
      drawPad(ctx, clientX, midY + 92, 58, SIGNAL, pulse)
      drawPad(ctx, serverX, midY + 92, 58, SIGNAL, 1 - pulse)
      drawPad(ctx, cx, midY + 108, 66, SIGNAL_SOFT, pulse)

      // Ambient drifting motes — sparse, so they read as depth cues rather
      // than a particle-system centerpiece.
      const dots = 26
      for (let i = 0; i < dots; i++) {
        const seed = i * 137.5
        const dx = clientX + ((seed * 3.1 + time * 26) % (serverX - clientX))
        const dy = midY - 60 + Math.sin(seed + time * 0.7) * 46
        const a = 0.12 + 0.1 * Math.sin(seed + time)
        ctx.beginPath()
        ctx.arc(dx, dy, 1.1, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${DIM}, ${Math.max(a, 0.03)})`
        ctx.fill()
      }

      if (!reduced && visible && document.visibilityState !== 'hidden') raf = requestAnimationFrame(render)
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (!visible) {
        cancelAnimationFrame(raf)
        raf = null
      } else if (!reduced && !raf) {
        raf = requestAnimationFrame(render)
      }
    }, { threshold: 0.05 })
    io.observe(wrap)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        cancelAnimationFrame(raf)
        raf = null
      } else if (visible && !reduced && !raf) {
        raf = requestAnimationFrame(render)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    raf = requestAnimationFrame(render)
    if (reduced) render(0)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* The relay is a restrained product surface rather than decorative 3D. */}
      <div
        className="absolute left-1/2 top-[50%] grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl sm:h-28 sm:w-28"
        style={{
          background: 'linear-gradient(180deg, rgba(16, 24, 22, 0.96), rgba(7, 12, 10, 0.98))',
          border: '1px solid rgba(34,197,94,0.38)',
          boxShadow: '0 0 0 1px rgba(34,197,94,0.08), 0 30px 60px -20px rgba(34,197,94,0.28), 0 0 38px -10px rgba(34,197,94,0.22)',
          animation: 'hero-breathe 3.6s ease-in-out infinite',
        }}
      >
        <span className="absolute inset-2 rounded-xl border border-accent/10" />
        <span className="ob-word relative text-[18px] sm:text-[20px]"><span className="ob-o">OUT</span><span className="ob-b">PATH</span></span>
      </div>

      <div className="absolute left-[3%] top-[69%] hidden sm:block">
        <span className="mono rounded-full border border-line bg-ink/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted backdrop-blur-sm">Client</span>
      </div>
      <div className="absolute left-1/2 top-[69%] -translate-x-1/2">
        <span className="mono rounded-full border border-accent/20 bg-accent/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-accent backdrop-blur-sm">Outpath relay</span>
      </div>
      <div className="absolute right-[3%] top-[69%] hidden sm:block">
        <span className="mono rounded-full border border-line bg-ink/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted backdrop-blur-sm">API server</span>
      </div>
      <div className="absolute right-[8%] top-[47%] hidden w-[110px] flex-col items-center sm:flex">
        <div className="relative h-20 w-px bg-accent/30">
          <span className="absolute -left-[1px] top-0 h-8 w-px origin-top animate-response-fall bg-accent" />
        </div>
        <div className="mt-2 rounded-xl border border-line bg-ink/85 px-3 py-2 text-left shadow-lift">
          <p className="mono text-[9px] uppercase tracking-[0.16em] text-muted">Request 01</p>
          <p className="mono mt-1 text-[10px] text-pass">response received</p>
        </div>
      </div>

      <style>{`
        @keyframes response-fall {
          0% { transform: translateY(0); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: translateY(52px); opacity: 0; }
        }
        @keyframes hero-breathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.035); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="hero-breathe"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
