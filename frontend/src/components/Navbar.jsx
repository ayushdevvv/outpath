import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, Settings as SettingsIcon, User, X } from 'lucide-react'
import { Avatar, Dropdown, cx } from './ui'
import { useAuth } from '@/lib/auth'

const LINKS = [
  { href: '#pipeline', label: 'Product' },
  { href: '#workflow', label: 'Features' },
  { href: '#security', label: 'Security' },
  { href: '#local-bridge', label: 'Local bridge' },
]

/** The icon-only account affordance — a plain ringed circle, the way the
 *  reference nav treats it, not a filled button competing with the hero CTA. */
function AccountButton({ user, status, signOut }) {
  const [open, setOpen] = useState(false)

  if (status !== 'authed') {
    return (
      <Link
        to="/signin"
        className="grid h-9 w-9 place-items-center rounded-full border border-line2 text-muted transition-all duration-150 hover:border-line hover:text-text active:scale-95"
        aria-label="Log in"
      >
        <User size={16} strokeWidth={1.75} />
      </Link>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full ring-0 ring-accent/40 transition-all duration-150 hover:ring-2 active:scale-95"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar user={user} size="h-9 w-9 text-[12px]" />
      </button>

      <Dropdown open={open} onClose={() => setOpen(false)} anchor="right" className="w-48">
        <div className="border-b border-line px-2.5 py-2">
          <p className="truncate text-[12.5px] text-text">{user?.name || 'Signed in'}</p>
          <p className="truncate text-[11px] text-muted">{user?.email}</p>
        </div>
        <div className="p-1">
          <Link
            to="/app"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            <LayoutDashboard size={14} /> Dashboard
          </Link>
          <Link
            to="/app?view=settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            <SettingsIcon size={14} /> Settings
          </Link>
          <button
            onClick={() => {
              setOpen(false)
              signOut()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted transition-colors hover:bg-fail/10 hover:text-fail"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </Dropdown>
    </div>
  )
}

export default function Navbar() {
  const { user, status, signOut } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header
      className={cx(
        'fixed inset-x-0 top-0 z-50 border-b border-line backdrop-blur-xl transition-all duration-300',
        scrolled ? 'bg-ink/92 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.9)]' : 'bg-ink/75',
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* True three-zone bar, edge to edge — logo pinned left, links pinned
          to the page's own centre (not the midpoint between logo and
          account button), account control pinned right. */}
      <nav className="grid h-16 w-full grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-8 lg:px-12">
        <Link to="/" className="flex w-fit items-center gap-2.5" aria-label="Outbox home">
          <span className="ob-word ob-bold text-[20px] sm:text-[17px]"><span className="ob-o">O</span><span className="ob-b">B</span></span>
          <span className="ob-word ob-bold hidden text-[16px] sm:inline-flex">
            <span className="ob-o">Out</span><span className="ob-b">box</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-9 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-[13.5px] text-muted transition hover:text-text">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center justify-self-end md:flex">
          <AccountButton user={user} status={status} signOut={signOut} />
        </div>

        <button
          className="col-start-3 ml-auto grid h-9 w-9 place-items-center rounded-lg text-muted md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      {open && (
        <div className="mx-4 mb-3 rounded-2xl border border-line bg-ink/95 p-3 backdrop-blur-xl md:hidden">
          <ul className="grid">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-sm text-muted hover:bg-white/5 hover:text-text"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 grid gap-2 border-t border-line pt-3">
            {status === 'authed' ? (
              <>
                <div className="flex items-center gap-2 px-1 py-1.5">
                  <Avatar user={user} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text">{user?.name || 'Signed in'}</p>
                    <p className="truncate text-[11px] text-muted">{user?.email}</p>
                  </div>
                </div>
                <Link
                  to="/app"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-text"
                >
                  <LayoutDashboard size={15} /> Dashboard
                </Link>
                <button
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted"
                  onClick={() => {
                    setOpen(false)
                    signOut()
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </>
            ) : (
              <Link
                to="/signin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-text"
              >
                <User size={15} /> Log in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
