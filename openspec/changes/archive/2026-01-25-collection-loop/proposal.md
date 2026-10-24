# Proposal

## Why

The critic's #1 finding: Torsongs is a good playback engine wrapped around a
*read-only catalog* — users can browse and search but cannot collect or
organize anything. Playlists are a "Soon" stub, liked songs are written to
localStorage but have no screen, the queue is invisible and uneditable, and
song rows have no context menu. This is the defining Spotify loop —
collect → organize → replay — and it's entirely absent.

## What Changes

- **Playlists**: client-side playlist management — create/rename/delete
  playlists, add/remove/reorder songs, `/playlists` + `/playlists/:id` routes,
  real Library section in the sidebar replacing the "Soon" stubs. Songs are
  stored as self-contained objects so playlists play without re-resolution.
- **Liked Songs screen**: `/liked` route that batch-resolves the existing
  likedSongs set via a new `/api/songs?ids=` endpoint and renders the standard
  song-row list.
- **Queue panel + track menus + context Play buttons**: a queue drawer
  (right-side on desktop, bottom sheet on mobile) showing upcoming items with
  play/remove/reorder/clear; a `...` context menu on song rows (Play next,
  Add to queue, Add to playlist, Like, Go to album); Play + Shuffle buttons
  on album/playlist/artist/search headers.
- **Server**: one new route `GET /api/songs?ids=a,b,c` proxying the existing
  `fetchWithFallback('songs', {ids})` helper — works on the Render prod path.

## Capabilities

### New Capabilities

- `playlists`: user-created playlists — CRUD, track management, persistence,
  navigation surfaces (routes + sidebar).
- `liked-songs`: the liked-songs collection as a browsable, playable screen.

### Modified Capabilities

- `playback`: adds requirements for queue inspection/manipulation, per-track
  context menus, and context-level Play/Shuffle buttons.

## Impact

- **New files**: `src/stores/playlistStore.js` (zustand + persist),
  `src/views/PlaylistsView.jsx`, `src/views/PlaylistDetailView.jsx`,
  `src/views/LikedSongsView.jsx`, `src/components/QueueDrawer.jsx`,
  `src/components/TrackMenu.jsx`
- **Modified**: `App.jsx` (routes, queue ops handlers, context-menu handlers,
  shuffle-play handler), `Sidebar.jsx` (Library section), `PlayerBar.jsx`
  (queue button), `DiscoverDetailView.jsx` + `SearchView.jsx` + new views
  (row menus + header buttons), `src/server.js` (`/api/songs` route)
- **APIs**: +1 GET route reusing existing fallback chain
- **State**: new persisted zustand store `playlists`; likedSongs stays
  localStorage (unchanged contract)
- **Deferred**: cross-device playlist sync (needs server persistence — Render
  disk is ephemeral; would need a free Postgres — phase 2 decision)
