import { useCallback, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GoogleLogin } from '@react-oauth/google'
import { Button, Field, Input, cx } from '@/components/ui'
import { useAuth } from '@/lib/auth'

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
          <span className="ob-word text-[21px]"><span className="ob-o">OUT</span><span className="ob-b">PATH</span></span>
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

function GoogleButton({ onCredential, onError }) {
  return (
    <div className="overflow-hidden rounded-[10px]">
      <GoogleLogin
        onSuccess={(credentialResponse) => {
          const credential = credentialResponse?.credential
          if (!credential) {
            onError?.(new Error('Google did not return a credential.'))
            return
          }
          Promise.resolve(onCredential(credential)).catch((err) => {
            onError?.(err)
          })
        }}
        onError={() => {
          onError?.(new Error('Google sign in was cancelled or failed.'))
        }}
        theme="outline"
        type="standard"
        size="large"
        text="continue_with"
        shape="rectangular"
        logo_alignment="left"
        width="100%"
        useOneTap={false}
        auto_select={false}
        ux_mode="popup"
      />
    </div>
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
  const { signIn, signInWithGoogleCredential, status } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const handleGoogle = useCallback(async (credential) => {
    setGoogleBusy(true)
    try {
      await signInWithGoogleCredential(credential)
      navigate('/app', { replace: true })
    } finally {
      setGoogleBusy(false)
    }
  }, [navigate, signInWithGoogleCredential])

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
      <div className={googleBusy ? 'pointer-events-none opacity-60' : ''}><GoogleButton onCredential={handleGoogle} onError={(err) => setError(err.message)} /></div>
    </AuthShell>
  )
}

/* --------------------------------------------------------------- sign up */

export function SignUp() {
  const { signUp, signInWithGoogleCredential, status } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const handleGoogle = useCallback(async (credential) => {
    setGoogleBusy(true)
    try {
      await signInWithGoogleCredential(credential)
      navigate('/app', { replace: true })
    } finally {
      setGoogleBusy(false)
    }
  }, [navigate, signInWithGoogleCredential])

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
      <div className={googleBusy ? 'pointer-events-none opacity-60' : ''}><GoogleButton onCredential={handleGoogle} onError={(err) => setError(err.message)} /></div>
    </AuthShell>
  )
}
