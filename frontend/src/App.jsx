import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './lib/toast'
import Landing from './pages/landing/Landing'
import { SignIn, SignUp } from './pages/auth/AuthPages'
import Dashboard from './pages/app/Dashboard'
import { ProductPage, FeaturesPage, SecurityPage, DocsPage } from './pages/public/MarketingPages'

function Booting() {
  return (
    <div className="grid h-[100svh] place-items-center bg-ink">
      <span className="ob-word text-[17px] animate-pulse"><span className="ob-o">OUT</span><span className="ob-b">PATH</span></span>
    </div>
  )
}

/** Routes under /app require a session. Unknown state waits rather than flashing. */
function RequireAuth({ children }) {
  const { status } = useAuth()
  if (status === 'loading') return <Booting />
  if (status !== 'authed') return <Navigate to="/signin" replace />
  return children
}

function NotFound() {
  return (
    <div className="grid h-[100svh] place-items-center bg-ink px-6 text-center">
      <div>
        <p className="font-display text-2xl">That page doesn't exist</p>
        <p className="mt-2 text-sm text-muted">Check the address, or head back to the workspace.</p>
        <a href="/" className="mono mt-6 inline-block text-[12px] text-accent hover:underline">
          Back to Outpath
        </a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route
            path="/app/*"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  )
}
