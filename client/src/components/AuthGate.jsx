import { createContext, useContext } from 'react'
import { useAuth, useClerk } from '@clerk/clerk-react'
import { Lock, LogIn } from 'lucide-react'

// Freemium gate — guests can search + play; EVERYTHING else (likes, playlists,
// downloads, library, stats, sync) is locked behind sign-in, Spotify-style.
// When Clerk isn't configured we don't gate anything — never lock users out
// of their own app.

const HAS_CLERK = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const AuthCtx = createContext({
  isLoaded: true,
  isSignedIn: true,
  requireAuth: (fn) => fn,
  openSignIn: () => {}
})

export function AuthProvider({ children }) {
  if (!HAS_CLERK) {
    return (
      <AuthCtx.Provider value={{ isLoaded: true, isSignedIn: true, requireAuth: (fn) => fn, openSignIn: () => {} }}>
        {children}
      </AuthCtx.Provider>
    )
  }
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>
}

function ClerkAuthProvider({ children }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { openSignIn } = useClerk()

  // run fn when signed in; as a guest, open the sign-in modal instead
  const requireAuth = (fn, onDeny) => {
    if (isSignedIn) return fn?.()
    openSignIn()
    onDeny?.()
  }

  return (
    <AuthCtx.Provider value={{ isLoaded, isSignedIn, requireAuth, openSignIn }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAppAuth = () => useContext(AuthCtx)

// Full-page lock screen for protected routes
export function LockScreen({ title = 'Unlock everything' }) {
  const { openSignIn, isLoaded } = useAppAuth()
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#fc3c44] rounded-full animate-spin" />
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-20">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-5">
        <Lock size={26} className="text-[#fc3c44]" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-zinc-400 max-w-xs mb-6">
        Sign in to unlock likes, playlists, downloads, your library, stats and cross-device sync.
        You can still search and play without an account.
      </p>
      <button
        onClick={openSignIn}
        className="flex items-center gap-2 rounded-full bg-[#fc3c44] hover:bg-[#e6353d] text-white font-semibold px-7 py-3 transition-colors"
      >
        <LogIn size={18} /> Sign in to continue
      </button>
    </div>
  )
}

// Route wrapper — renders a lock screen for guests
export function ProtectedRoute({ children, title }) {
  const { isLoaded, isSignedIn } = useAppAuth()
  if (!isLoaded) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-zinc-700 border-t-[#fc3c44] rounded-full animate-spin" /></div>
  if (!isSignedIn) return <LockScreen title={title} />
  return children
}
