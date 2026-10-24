import { useState, useRef, useEffect } from 'react'
import { useClerk, useUser } from '@clerk/clerk-react'
import { UserRound, LogOut, ChevronDown, UserPlus } from 'lucide-react'

// Spotify-style account control: "Sign in" button when signed out, avatar +
// name menu when signed in. Opens Clerk's hosted/unstyled modal (friends &
// family scale — no invite list, anyone with the link can sign up).
export default function UserMenu({ compact = false }) {
  const { openSignIn, signOut } = useClerk()
  const { isSignedIn, user } = useUser()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!isSignedIn || !user) {
    return (
      <button
        onClick={() => openSignIn()}
        className="flex items-center gap-2 rounded-full bg-[#fc3c44] hover:bg-[#e6353d] text-white text-sm font-semibold px-4 py-2 transition-colors touch-target"
        title="Sign in"
      >
        <UserPlus size={16} />
        {!compact && <span>Sign in</span>}
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white text-sm pl-1 pr-2 py-1 transition-colors touch-target"
        title={user.fullName || user.primaryEmailAddress?.emailAddress || 'Account'}
      >
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="w-7 h-7 rounded-full bg-[#fc3c44] flex items-center justify-center">
            <UserRound size={14} />
          </span>
        )}
        {!compact && (
          <span className="max-w-28 truncate font-medium">
            {user.fullName || user.firstName || user.username || 'Me'}
          </span>
        )}
        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="text-sm font-semibold text-white truncate">{user.fullName || 'User'}</div>
            <div className="text-xs text-zinc-500 truncate">{user.primaryEmailAddress?.emailAddress || user.username || ''}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-left"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}