import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cx } from '@/components/ui'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const TONE = {
  success: 'text-pass border-pass/25 bg-pass/[0.07]',
  error: 'text-fail border-fail/25 bg-fail/[0.07]',
  warning: 'text-hold border-hold/25 bg-hold/[0.07]',
  info: 'text-info border-info/25 bg-info/[0.07]',
}

const ICON_TONE = {
  success: 'text-pass',
  error: 'text-fail',
  warning: 'text-hold',
  info: 'text-info',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (type, message, opts = {}) => {
      const id = ++counter.current
      const toast = { id, type, message, description: opts.description }
      setToasts((t) => [...t, toast].slice(-4))
      const duration = opts.duration ?? (type === 'error' ? 6000 : 3600)
      if (duration !== Infinity) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (message, opts) => push('success', message, opts),
      error: (message, opts) => push('error', message, opts),
      warning: (message, opts) => push('warning', message, opts),
      info: (message, opts) => push('info', message, opts),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] sm:items-end sm:pr-5"
            aria-live="polite"
          >
            <AnimatePresence initial={false}>
              {toasts.map((t) => {
                const Icon = ICONS[t.type] || Info
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, y: -12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className={cx(
                      'surface pointer-events-auto flex w-full max-w-sm items-start gap-2.5 border px-3.5 py-3 shadow-popover',
                      TONE[t.type],
                    )}
                  >
                    <Icon size={17} className={cx('mt-0.5 shrink-0', ICON_TONE[t.type])} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug text-text">{t.message}</p>
                      {t.description && (
                        <p className="mt-0.5 text-[12px] leading-snug text-muted">{t.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => dismiss(t.id)}
                      className="shrink-0 rounded p-0.5 text-muted transition hover:text-text"
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
