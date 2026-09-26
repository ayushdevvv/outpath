import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from './api'
import { useToast } from './toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // loading | authed | anon

  const load = useCallback(async () => {
    try {
      const me = await api.get('/api/auth/me')
      setUser(me)
      setStatus('authed')
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        // Backend unreachable — surface it rather than pretending the user is signed out.
        setStatus('anon')
        setUser(null)
        return
      }
      setUser(null)
      setStatus('anon')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const signIn = useCallback(
    async (email, password) => {
      try {
        const me = await api.post('/api/auth/login', { email, password })
        setUser(me)
        setStatus('authed')
        toast.success(`Welcome back, ${me.name?.split(' ')[0] || 'there'}.`)
        return me
      } catch (err) {
        toast.error('Sign in failed', { description: err.message })
        throw err
      }
    },
    [toast],
  )

  const signUp = useCallback(
    async (name, email, password) => {
      try {
        const me = await api.post('/api/auth/register', { name, email, password })
        setUser(me)
        setStatus('authed')
        toast.success('Account created — welcome to Outpath.')
        return me
      } catch (err) {
        toast.error('Sign up failed', { description: err.message })
        throw err
      }
    },
    [toast],
  )

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
      toast.info('Signed out.')
    } catch (err) {
      toast.error("Couldn't reach the server to sign out", { description: err.message })
    } finally {
      setUser(null)
      setStatus('anon')
    }
  }, [toast])

  const value = useMemo(
    () => ({ user, status, signIn, signUp, signOut, reload: load }),
    [user, status, signIn, signUp, signOut, load],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
