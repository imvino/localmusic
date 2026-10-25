# Design

## Context

Nearly all items are client-side or reuse existing endpoints. **One additive server change is required**: `/api/me/library` PUT must accept and merge `folders` + `removedFolders` (the PUT handler destructures a fixed field list — unknown fields are silently dropped today). Everything else needs no server work.

Verified codebase facts (corrected after grill):
- `followedArtists` syncs as `[{id,name,followedAt}]` in localStorage; the React state is a `Set` of ids — rails must read the localStorage array (or a threaded prop) for names.
- `/api/trending` items carry `artists`; `/api/new-releases` items do NOT — followed-artist matching is trending-scoped.
- `/api/artist/:id` already returns the full discography (up to 20 upstream pages) + `followerCount`. There is no `page` param and `client/src/api.js` does not exist (hooks live in `useApi.js`). "Show all" is purely client-side.
- `/api/artist/:id` is the app's heaviest endpoint (~41 upstream calls) — daily mixes must never call it.
- `useHealthCheck` in App.jsx polls `/api/health` every 30s (fails on any fetch error) — combined with `navigator.onLine` events it distinguishes "no internet" from "server unreachable".
- `utils/color.js` loads palette images with `crossOrigin='anonymous'` — the pattern for canvas-safe artwork.
- `slimSong`/`slimPlaylists` + `TOMB_KEYS`/`addTombstone`/`applyTombstones`/`isTombstoned` in `client/src/utils/sync.js` are the proven tombstone machinery — folders reuse them 1:1.

## Decisions

### 1. New-from-followed rail (discovery)
`DiscoverView` gets `followedArtists` read from `localStorage` (member-only, `isSignedIn` gate — same pattern as Recently Played). Trending items carry `artists` as an **array of objects with `.name`** — the matcher maps to names first, then normalizes (`toLowerCase` + strip non-alphanumerics so "A. R. Rahman" matches "AR Rahman"). The normalizer is a pure helper in `sync.js` (vitest-covered) shared with the daily-mix artist clustering. Featured-artist matches are accepted noise (noted in spec). Rail renders after the hero.

### 2. followerCount + Show-all (artist-profiles)
Header renders `data.followerCount` via a `formatCount` (K/M) helper when present. Albums tab: render first 50, "Show all" reveals the rest from the already-loaded array — zero network. Server-side pagination of the heavy artist fetch is a *separate* pre-existing perf issue, explicitly out of scope here.

### 3. Family Blend
`encodeBlendShare(name, ids)` → `/blend/:data` → `BlendView`. Encoding = up to 50 ids (local-collection ids excluded up front), minimal metadata to bound URL length (same mechanism as `/shared/`, which ships ~100-song URLs today). Decode → resolve via `/api/songs` batch (50-id cap aligns) → intersect with `likedSongs` ∪ `playCounts` keys ∪ `playHistory` ids.
- **Guests**: preview the creator's songs (batch resolve needs no auth); the overlap section + save are behind `requireAuth`. The existing AuthGate pending-action pattern makes the post-sign-in save safe (it waits for pullDone).
- **Import**: songs are `slimSong`'d before `importPlaylist` (raw API responses carry `downloadUrl` arrays — ~5KB/50 songs of LS bloat otherwise).
- **Env note**: local ids can't resolve on the recipient's device; they're excluded at encode time so behavior is identical dev/prod.

### 4. Daily mixes (discovery)
Cluster `playCounts` by `artist` → top-3 by total count. Each mix = the user's own top-played songs for that artist (from the `playCounts` slimSong entries — free, offline, genuinely "your mix"), topped up to ~20 via `/api/songs/:id/suggestions` on the top song — one cheap call per mix, ≤3 total. Member-only. React-query cache keyed `daily-mix-{n}-{yyyy-mm-dd}` → daily refresh.

### 5. Offline banner + storage meter (offline)
Extend the existing `useHealthCheck` signal: banner shows on `navigator.onLine === false`, `offline` event, or health-check failure. Two states: "No internet" vs "Server unreachable" (health-check distinguishes). DownloadsView meter: `navigator.storage.estimate()` quota + sum of `blob.size` over `caches.open('audio-downloads').keys()`; degrade to item count when unsupported (older Safari).

### 6. Private session (listening-history)
`privateSession` in a persisted store + `handlePlaying` guards the `playHistory`/`playCounts`/`lastPlayed` writes. Sidebar toggle (eye icon) + "Private" chip near avatar. Device-scoped, never synced.

### 7. Swipe gestures (playback)
Extract FullScreenPlayer's axis-lock touch code into `useSwipeAction({onSwipeLeft,onSwipeRight})`: extracted constants: ~70px fire threshold, axis lock via `dx > dy` (≈45° cone), 10px activation; tighten the cone only if real-device QA shows scroll fights. Applied to rows in DiscoverDetailView / PlaylistDetailView / LikedSongsView **plus** `touch-action: pan-y` on the row element (iOS Safari cancels the gesture without it). **Visual feedback**: the row slides with the finger and reveals a queue icon (left) / heart icon (right) under it while dragging — snap back below threshold, suppress the row's click after a completed swipe. Non-touch devices: handlers attach but never fire — no UI change. Guest swipe-right → `requireAuth`.

### 8. Wrapped-lite (stats)
`/wrapped` (ProtectedRoute) + `WrappedView`: aggregates `playCounts` — top songs/artists by count, minutes = Σ(count×duration). Entries with `ts: 0`/missing (legacy merges) bucket into "all-time". Empty state for zero counts.
Canvas card: draw artwork via `new Image()` with `img.crossOrigin='anonymous'` per-image, skip failures per-image; only when ALL artwork fails does the card go text-only (`referrerPolicy` does NOT affect canvas origin-cleanliness — CORS does; verify ACAO on the CDN during dev, fallback covers the rest). `canvas.toBlob` → `navigator.share({files})`; text summary fallback.

### 9. Playlist folders — WITH TOMBSTONES (playlists)
This is the same resurrection bug class fixed for playlists — mirrored 1:1:
- `playlistStore`: `folders: {id:{id,name,createdAt,updatedAt}}` + `playlist.folderId` + folder CRUD. `deleteFolder` writes `addTombstone('folders', id)` and un-files members (sets their `folderId: undefined`, bumps `updatedAt`).
- `sync.js`: `TOMB_KEYS.folders = 'removedFolders'`; `slimPlaylists` carries `folderId`; `slimFolders` helper; push sends `folders` + `removedFolders`.
- Server PUT: accepts `folders`/`removedFolders`; **`safePlaylists` gains `folderId: String(p.folderId || '')` — without it the server strips the assignment on every push and a device's own pull deletes its own folders** (server-merge `>=` prefers the stored copy); unions folders by id (newest `updatedAt` wins — same merge shape as playlists); unions `removedFolders` into `data.tombstones.folders`; filters folders where `tomb.ts > folder.createdAt`; clears `folderId` on member playlists **only when the folder was killed by the tomb filter in this merge** (`tomb.ts > folder.createdAt`) — an unconditional clear would strip membership from restored folders, since server tombstones persist forever while a restamped folder legitimately survives.
- Client pull: folds server `folders` tombstones into local tombs (existing loop already iterates `TOMB_KEYS`); merges folders like playlists; un-files member playlists **only for folders the tomb filter killed this merge** (same age guard as server). Additionally: when the server's playlist copy lacks `folderId` entirely (un-migrated or rolled-back server), the local copy's `folderId` wins — a defensive guard that also makes the regression vitest-able client-side.
- `PERSONAL_KEYS` gains `removedFolders`.
- Backup/restore: `BackupControls` export/import gains `folders` + `removedFolders`; import restamps `createdAt`/`updatedAt`, `clearTombstone('folders', id)` per restored folder, and keeps `playlist.folderId` intact so membership is restored with the folder (this is the restore mechanism the spec scenario refers to — no separate undo UI for folders).
- Sidebar rendering decision: **pinned wins** — a pinned playlist renders in the pinned section regardless of folder membership (folder grouping applies to unpinned playlists).

## Risks

- **Folder tombstone omission = known resurrection bug** — the reason this mirrors playlists 1:1 rather than "additive union" alone.
- Swipe + tap conflict on rows — axis-lock mitigates; real-device QA needed (Playwright can't fully emulate).
- Canvas artwork grid depends on CDN ACAO — per-image tolerance + text fallback bound the outcome.
- Blend/share URL length — capped at 50 ids with slim encoding; worst case matches shipped shared-playlist links.
- `/api/songs` batch 50-id URL length — same class as existing batch calls; low risk.

## Out of scope (explicit)

- Server-side pagination/lazification of the heavy `/api/artist/:id` fetch — separate change.
- True overlapping crossfade (dual `<audio>`), Jam/real-time queue, Connect handoff, podcasts — infra-bound.
