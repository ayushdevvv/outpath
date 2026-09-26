import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Field, Input, cx } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { OAUTH_GOOGLE_URL } from '@/lib/api'

/** A quiet dot-grid backdrop behind the centered card. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="grid-floor absolute inset-0 opacity-[0.35]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 40% at 50% 0%, rgba(34,197,94,0.14), transparent 70%),' +
            'radial-gradient(50% 40% at 100% 100%, rgba(94,168,255,0.08), transparent 70%)',
        }}
      />
    </div>
  )
}

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-ink px-4 py-10">
      <Backdrop />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="surface relative w-full max-w-[400px] p-6 shadow-lift sm:p-8"
      >
        <Link to="/" className="mb-7 flex items-center justify-center gap-2">
          <span className="ob-word text-[24px]"><span className="ob-o">O</span><span className="ob-b">B</span></span>
        </Link>

        <div className="text-center">
          <h1 className="display text-[1.6rem] text-text">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{subtitle}</p>
        </div>

        <div className="mt-7">{children}</div>

        <p className="mt-6 text-center text-[13px] text-muted">{footer}</p>
      </motion.div>
    </div>
  )
}

function GoogleButton({ label }) {
  return (
    <a href={OAUTH_GOOGLE_URL} className="block">
      <Button variant="outline" className="w-full" type="button">
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2H12z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
          <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.8V7.6H3.1a10 10 0 0 0 0 8.9L6.4 14z" />
          <path fill="#4285F4" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.6l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9z" />
        </svg>
        {label}
      </Button>
    </a>
  )
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] text-dim">or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/* --------------------------------------------------------------- sign in */

export function SignIn() {
  const { signIn, status } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'authed') return <Navigate to="/app" replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(form.email, form.password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to reach your collections, environments and history."
      footer={
        <>
          No account yet?{' '}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
          />
        </Field>

        {error && (
          <p className="animate-fade-up rounded-lg border border-fail/30 bg-fail/10 px-3 py-2 text-[13px] text-fail">
            {error}
          </p>
        )}

        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
      </form>

      <Divider />
      <GoogleButton label="Continue with Google" />
    </AuthShell>
  )
}

/* --------------------------------------------------------------- sign up */

export function SignUp() {
  const { signUp, status } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'authed') return <Navigate to="/app" replace />

  const weak = form.password.length > 0 && form.password.length < 10

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (weak) return
    setBusy(true)
    try {
      await signUp(form.name, form.email, form.password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Your requests, environments and history stay scoped to this account."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name">
          <Input
            autoComplete="name"
            required
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ada Lovelace"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@company.com"
          />
        </Field>
        <Field
          label="Password"
          hint="At least 10 characters."
          error={weak ? 'Use at least 10 characters.' : ''}
        >
          <Input
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••••"
            className={cx(weak && 'border-fail/50')}
          />
        </Field>

        {error && (
          <p className="animate-fade-up rounded-lg border border-fail/30 bg-fail/10 px-3 py-2 text-[13px] text-fail">
            {error}
          </p>
        )}

        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>

      <Divider />
      <GoogleButton label="Sign up with Google" />
    </AuthShell>
  )
}
