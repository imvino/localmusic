// Per-account personal data scrub — the shared-device fix.
// On sign-out (or when a *different* Clerk user signs in on the same browser),
// every personal localStorage key is wiped so the previous user's library
// can't leak into, or be union-merged into, the next account.

export const LAST_USER_KEY = 'clerkLastUserId'

// Personal keys only — device prefs (eq, quality, autoplay) and the
// TanStack catalog cache stay; they belong to the device, not the account.
const PERSONAL_KEYS = [
  'likedSongs',
  'likedMeta',
  'playlists',       // zustand persist key
  'playHistory',
  'playCounts',
  'historyClearedAt',
  'playerSession',
  'downloads',
  'savedAlbums',
  'followedArtists',
  'libraryLastSync',
  'recentSearches',
  // Tombstones — CRITICAL: a surviving tombstone lets the previous user's
  // delete propagate into the NEXT account's library (cross-account loss).
  'removedSongs',
  'removedAlbums',
  'removedArtists',
  'removedPlaylists',
  'removedFolders',
]

export function clearPersonalData() {
  for (const k of PERSONAL_KEYS) {
    try { localStorage.removeItem(k) } catch { /* storage blocked */ }
  }
}

export const getLastUserId = () => {
  try { return localStorage.getItem(LAST_USER_KEY) } catch { return null }
}

export const setLastUserId = (id) => {
  try { id ? localStorage.setItem(LAST_USER_KEY, id) : localStorage.removeItem(LAST_USER_KEY) } catch { /* ignore */ }
}
