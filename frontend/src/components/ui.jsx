import { forwardRef, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/* --------------------------------------------------------------- button */

const VARIANTS = {
  // Every primary action in the product uses the same solid green, flat fill.
  primary:
    'bg-[#22C55E] text-ink font-bold shadow-[0_10px_28px_-16px_rgba(34,197,94,0.9)] transition-all duration-300 hover:brightness-105 hover:shadow-accent active:brightness-95 disabled:opacity-40 disabled:shadow-none',
  premium:
    'bg-[#22C55E] text-ink font-bold shadow-[0_10px_28px_-16px_rgba(34,197,94,0.9)] transition-all duration-300 hover:brightness-105 hover:shadow-accent active:brightness-95 disabled:opacity-40 disabled:shadow-none',
  ghost: 'text-muted hover:text-text hover:bg-white/[0.06] disabled:opacity-40',
  outline: 'border border-line2 bg-white/[0.02] text-text shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] hover:border-accent/35 hover:bg-white/[0.045] disabled:opacity-40',
  danger: 'border border-fail/35 text-fail hover:bg-fail/10 disabled:opacity-40',
  subtle: 'border border-line bg-white/[0.04] text-text shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] hover:border-line2 hover:bg-white/[0.075] disabled:opacity-40',
}

const SIZES = {
  xs: 'h-7 px-2.5 text-[12px] rounded-[7px]',
  sm: 'h-9 px-3.5 text-[13px] font-semibold rounded-[9px]',
  md: 'h-10 px-4 text-sm font-semibold rounded-[10px]',
  lg: 'h-12 px-6 text-[15px] font-semibold rounded-[10px]',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', busy = false, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={props.disabled || busy}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap border border-transparent transition-all duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
})

/* ---------------------------------------------------------------- input */

export const Input = forwardRef(function Input({ className, mono, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cx(
        'h-10 w-full rounded-[10px] border border-line bg-black/30 px-3 text-sm text-text placeholder:text-dim hover:border-line2',
        'transition-colors duration-150 focus:border-accent/50 focus:bg-black/40 focus:outline-none focus:ring-4 focus:ring-accent/10',
        mono && 'mono',
        className,
      )}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ className, mono = true, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cx(
        'w-full rounded-[10px] border border-line bg-black/30 p-3 text-[12.5px] leading-relaxed text-text placeholder:text-dim hover:border-line2',
        'transition-colors duration-150 focus:border-accent/50 focus:bg-black/40 focus:outline-none focus:ring-4 focus:ring-accent/10',
        mono && 'mono',
        className,
      )}
    />
  )
})

export const Select = forwardRef(function Select({ className, mono, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      {...props}
      className={cx(
        'h-10 rounded-[10px] border border-line bg-black/30 px-2.5 text-[13px] text-text outline-none hover:border-line2',
        'transition-colors duration-150 focus:border-accent/50',
        mono && 'mono',
        className,
      )}
    >
      {children}
    </select>
  )
})

export function Checkbox({ className, ...props }) {
  return (
    <input
      type="checkbox"
      {...props}
      className={cx('h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#22C55E]', className)}
    />
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span className="block text-[12px] text-fail">{error}</span>
      ) : hint ? (
        <span className="block text-[12px] text-dim">{hint}</span>
      ) : null}
    </label>
  )
}

/* ----------------------------------------------------------------- card */

export function Card({ className, hover = false, padding = 'p-4', children, ...props }) {
  return (
    <div className={cx('app-card', padding, hover && 'app-card-hover', className)} {...props}>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- badge */

const TONES = {
  pass: 'text-pass bg-pass/10 border-pass/25',
  fail: 'text-fail bg-fail/10 border-fail/25',
  hold: 'text-hold bg-hold/10 border-hold/25',
  accent: 'text-accent bg-accent/10 border-accent/25',
  info: 'text-info bg-info/10 border-info/25',
  muted: 'text-muted bg-white/5 border-line',
}

export function Badge({ tone = 'muted', className, children }) {
  return (
    <span
      className={cx(
        'mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Initials avatar — the one pattern used everywhere a user is represented. */
export function Avatar({ user, size = 'h-7 w-7 text-[11px]', className }) {
  const initial = (user?.name || user?.email || '?').slice(0, 1).toUpperCase()
  return (
    <span
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-soft to-accent-deep font-bold text-ink shadow-[0_0_18px_-6px_rgba(34,197,94,0.7)]',
        size,
        className,
      )}
    >
      {initial}
    </span>
  )
}

export function Dot({ tone = 'muted', pulse = false }) {
  const color = { pass: '#34D399', fail: '#F5657A', hold: '#F2B84B', accent: '#22C55E', info: '#5EA8FF', muted: '#8B9A9B' }[
    tone
  ]
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-60"
          style={{ background: color }}
        />
      )}
      <span className="relative h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  )
}

/* -------------------------------------------------------------- loading */

export function Skeleton({ className }) {
  return <div className={cx('skeleton-shimmer animate-shimmer rounded-lg', className)} />
}

/** Empty states invite an action rather than apologising. */
export function EmptyState({ title, body, action, icon: Icon }) {
  return (
    <div className="app-card animate-fade-up flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {Icon && (
        <span className="icon-chip mb-1">
          <Icon size={18} strokeWidth={1.75} />
        </span>
      )}
      <p className="font-display text-lg text-text">{title}</p>
      <p className="max-w-xs text-sm leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  )
}

/** Errors say what happened and what to do next. */
export function ErrorState({ title = 'Something failed', body, action }) {
  return (
    <div className="app-card animate-fade-up flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl border border-fail/25 bg-fail/10 text-fail">
        <AlertTriangle size={18} />
      </div>
      <p className="font-display text-lg text-text">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  )
}

/* ----------------------------------------------------------------- tabs */

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex items-center gap-1 overflow-x-auto scrollbar-none', className)}>
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cx(
              'relative shrink-0 rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150',
              active ? 'text-text' : 'text-muted hover:text-text',
            )}
          >
            {t.label}
            {t.count > 0 && (
              <span className="mono ml-1.5 rounded-full bg-white/8 px-1.5 text-[10px] text-muted">
                {t.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={`tab-indicator-${className || 'default'}`}
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- modal */

export function Modal({ open, onClose, title, description, children, footer, size = 'sm' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (typeof document === 'undefined') return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] grid place-items-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cx('app-card relative w-full shadow-popover', widths[size])}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-4">
              <div className="min-w-0">
                {title && <h2 className="font-display text-[16px] tracking-tightest text-text">{title}</h2>}
                {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-md p-1 text-muted transition hover:bg-white/5 hover:text-text"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line p-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ------------------------------------------------------------- dropdown */

export function Dropdown({ open, onClose, anchor = 'left', className, children }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -2 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className={cx(
            'absolute z-30 mt-2 rounded-xl border border-line bg-raised p-1 shadow-popover',
            anchor === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------ page frame */

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="relative mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <span className="absolute -bottom-px left-0 h-px w-20 bg-gradient-to-r from-accent to-transparent" />
      <div className="min-w-0">
        <h1 className="font-display text-[26px] leading-tight tracking-tightest text-text sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[64ch] text-[13.5px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
