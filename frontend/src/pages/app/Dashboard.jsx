import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  FolderTree,
  Gauge,
  History as HistoryIcon,
  Layers,
  LogOut,
  Menu,
  Plus,
  Settings as SettingsIcon,
  Send,
  X,
} from 'lucide-react'
import { Avatar, Button, Dropdown, Skeleton, cx } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import { api } from '@/lib/api'
import RequestWorkspace from './RequestWorkspace'
import { CollectionsPanel, EnvironmentsPanel, HistoryPanel, OverviewPanel, SettingsPanel } from './panels'

const NAV = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'collections', label: 'Collections', icon: FolderTree },
  { id: 'workspace', label: 'Requests', icon: Send },
  { id: 'environments', label: 'Environments', icon: Layers },
  { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const [view, setView] = useState(
    NAV.some((item) => item.id === requestedView) ? requestedView : 'workspace',
  )
  const [navOpen, setNavOpen] = useState(false)

  const [environments, setEnvironments] = useState(null)
  const [envError, setEnvError] = useState('')
  const [activeEnvId, setActiveEnvId] = useState(null)
  const [envMenu, setEnvMenu] = useState(false)

  const [draft, setDraft] = useState(null) // a saved request opened into the workspace
  const [wsKey, setWsKey] = useState(0) // bumps to give "New request" a fresh, blank workspace
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setEnvError('')
    api
      .get('/api/environments')
      .then((rows) => {
        if (cancelled) return
        setEnvironments(rows)
        setActiveEnvId((id) => id ?? rows[0]?.id ?? null)
      })
      .catch((err) => !cancelled && setEnvError(err.message))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const envList = environments

  const activeEnv = useMemo(
    () => envList?.find((e) => e.id === activeEnvId) || envList?.[0] || null,
    [envList, activeEnvId],
  )

  const vars = useMemo(() => {
    const out = {}
    for (const v of activeEnv?.variables || []) out[v.name] = v.value
    return out
  }, [activeEnv])

  const openRequest = useCallback((request) => {
    setDraft(request)
    setView('workspace')
    setNavOpen(false)
  }, [])

  const newRequest = useCallback(() => {
    setDraft(null)
    setWsKey((k) => k + 1)
    setView('workspace')
    setNavOpen(false)
  }, [])

  const selectEnv = (env) => {
    setActiveEnvId(env.id)
    setEnvMenu(false)
    toast.info(`Switched to “${env.name}”.`)
  }

  return (
    <div className="flex h-[100svh] overflow-hidden bg-ink">
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col border-r border-line bg-panel transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] lg:static lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-5">
          <Link to="/" className="flex w-fit items-center" aria-label="Outpath home">
            <span className="ob-word ob-bold text-[14px]"><span className="ob-o">OUT</span><span className="ob-b">PATH</span></span>
          </Link>
          <button
            className="ml-auto text-muted transition hover:text-text lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pb-1 pt-4">
          <Button variant="premium" className="w-full" onClick={newRequest}>
            <Plus size={16} strokeWidth={2.5} /> New request
          </Button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => {
            const active = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id)
                  setNavOpen(false)
                }}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'group relative flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-150',
                  active ? 'nav-active font-semibold text-text' : 'text-muted hover:bg-white/[0.04] hover:text-text',
                )}
              >
                {active && <span className="nav-rail" />}
                <item.icon size={16} strokeWidth={1.75} className={active ? 'text-accent' : ''} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.02] p-2.5">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-text">{user?.name || 'Signed in'}</p>
              <p className="truncate text-[11px] text-muted">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              className="rounded-md p-1.5 text-muted transition hover:bg-fail/10 hover:text-fail"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {navOpen && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          />
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 min-w-0 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-ink/80 px-3 py-2 backdrop-blur-xl sm:h-14 sm:px-6 sm:py-0">
          <button
            className="shrink-0 text-muted transition hover:text-text lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>

          <div className="relative min-w-0 shrink">
            {environments === null && !envError ? (
              <Skeleton className="h-9 w-36" />
            ) : (
              <button
                onClick={() => setEnvMenu((v) => !v)}
                className="flex h-9 min-w-0 items-center gap-2 rounded-[10px] border border-line bg-black/30 px-3 text-[12px] text-text transition hover:border-accent/35"
                aria-haspopup="listbox"
                aria-expanded={envMenu}
              >
                <Layers size={13} className="shrink-0 text-muted" />
                <span className="mono max-w-[40vw] truncate sm:max-w-[220px]">{activeEnv?.name || 'No environment'}</span>
                <ChevronDown size={13} className="shrink-0 text-muted" />
              </button>
            )}

            <Dropdown open={envMenu && envList?.length > 0} onClose={() => setEnvMenu(false)} className="w-56">
              <ul role="listbox">
                {envList?.map((env) => (
                  <li key={env.id}>
                    <button
                      role="option"
                      aria-selected={env.id === activeEnvId}
                      onClick={() => selectEnv(env)}
                      className={cx(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[12px] transition-colors',
                        env.id === activeEnvId ? 'bg-white/[0.07] text-text' : 'text-muted hover:text-text',
                      )}
                    >
                      <span className="mono truncate">{env.name}</span>
                      <span className="mono text-[10px] text-muted">{env.variables?.length || 0}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Dropdown>
          </div>

          {envError && (
            <span className="mono min-w-0 max-w-[40vw] shrink truncate text-[11px] text-fail" title={envError}>
              {envError}
            </span>
          )}

          <Button variant="premium" size="sm" className="ml-auto shrink-0 lg:hidden" onClick={newRequest}>
            <Plus size={15} strokeWidth={2.5} /> New request
          </Button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {view === 'workspace' && (
                <RequestWorkspace
                  key={`${draft?.id || 'new'}-${wsKey}`}
                  initialRequest={draft}
                  vars={vars}
                  activeEnv={activeEnv}
                  onSaved={refresh}
                />
              )}
              {view === 'overview' && <OverviewPanel onOpen={openRequest} onNavigate={setView} onNewRequest={newRequest} />}
              {view === 'collections' && <CollectionsPanel onOpen={openRequest} onChanged={refresh} />}
              {view === 'environments' && (
                <EnvironmentsPanel environments={environments} error={envError} onChanged={refresh} />
              )}
              {view === 'history' && <HistoryPanel onOpen={openRequest} />}
              {view === 'settings' && <SettingsPanel />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
