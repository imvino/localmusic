# Proposal

## Why

Eight critic rounds converged the sync/correctness layer, but a feature-gap audit shows daily Spotify users still miss discoverable personalization and social-feel features. This change ships the top-8 highest feel-per-effort items for the friends-and-family Tamil/Hindi listening context — all client-side or thin server additions, no new infrastructure.

## What Changes

- **Followed-artist new releases**: diff trending/new-release rails against `followedArtists` → "New from artists you follow" rail on Discover + badge dot on Follow buttons.
- **Artist page depth**: render `followerCount` (already returned by `/api/artist/:id`, never displayed) + "Show all" client-side expand on the albums tab (the full discography already arrives in one fetch — no new endpoint).
- **Family Blend**: encode top playCounts song ids in a share URL; recipient's client intersects with their own likes/history → overlap count + merged playlist. Guests can preview the link; saving requires sign-in.
- **Daily mixes**: cluster `playCounts` by artist → top-3 clusters → "Daily Mix 1/2/3" cards seeded from the user's own top-played songs per artist, filled out via the existing suggestions endpoint (no heavy `/api/artist/:id` fetches).
- **Offline awareness**: `online`/`offline` banner + Downloads storage meter via `navigator.storage.estimate()` + cache blob sizes.
- **Private session**: sidebar toggle → skip `playHistory`/`playCounts` writes; subtle indicator.
- **Swipe gestures**: swipe-left → Add to queue, swipe-right → Like on mobile song rows (reuse FullScreenPlayer axis-lock gesture code).
- **Wrapped-lite**: `/wrapped` view aggregating count-weighted top songs/artists/minutes → shareable canvas card via `navigator.share({files})`.
- **Playlist folders**: `folderId` field + collapsible groups in PlaylistsView and Sidebar.

## Capabilities

### New Capabilities
- `family-blend`: shareable overlap link that intersects two members' listening data client-side and produces a merged playlist.

### Modified Capabilities
- `discovery`: adds followed-artist new-release rail + artist-clustered daily mixes.
- `artist-profiles`: renders follower count; adds discography pagination.
- `offline`: adds offline status banner + downloads storage meter.
- `listening-history`: adds private-session mode that suspends history/count writes.
- `playback`: adds swipe gestures on mobile song rows.
- `stats`: adds shareable yearly recap card view.
- `playlists`: adds folder grouping for playlist organization, including cross-device folder deletion via tombstones.
- `liked-songs`: adds a song-count display in sidebar/library.

## Impact

- Client: `DiscoverView`, `DiscoverDetailView`, `Sidebar`, `PlaylistsView`, `StatsView`, new `WrappedView`, `DownloadsView`, `App.jsx` (history writes, share routes), `playlistStore` (folderId), `playlistStore`/`sync.js` (folderId in slimPlaylists).
- Server: one additive change — `/api/me/library` PUT accepts + union-merges `folders`/`removedFolders` AND persists `folderId` on playlist records (`safePlaylists` currently whitelists fields — without it the server strips assignments on every push). Rollback-safe: unknown fields were dropped before.
- No new dependencies. Canvas rendering for Wrapped is hand-rolled.
