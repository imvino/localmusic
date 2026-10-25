# Proposal

## Why

The exhaustive Spotify-parity audit (post `spotify-parity-features`) found the remaining felt-parity gaps concentrated in playlist ergonomics, search responsiveness, playback polish, and family-fit controls. The app still can't reorder a playlist without one-arrow-at-a-time clicking, search gives no suggestions while typing, "smooth transitions" isn't true crossfade, and a family app has no way to hide disliked content or filter explicit tracks.

## What Changes

- **Playlist ergonomics**: add a sort menu (Custom/Title/Artist/Recently added — matching `LikedSongsView`) and HTML5 drag-to-reorder on playlist rows (reusing `QueueDrawer`'s drag pattern + `moveSong`), replacing arrow-only reordering.
- **Search typeahead**: proxy JioSaavn `/search/suggestions` through a new `/api/search/suggestions` route and render a debounced suggestion dropdown under the search input (songs/albums/artists, click-through + keyboard navigation).
- **Content controls**: `hiddenSongs`/`hiddenArtists` blocklists (TrackMenu "Don't play this" / "Don't play this artist", Settings manage/clear) filtered out of queues, radios, autoplay, and discovery rails; explicit-content toggle filtering `explicit_content`/`explicitContent` flags with grayed-out play.
- **True crossfade/gapless**: second preloaded `<audio>` element so the next track overlaps the current one's tail inside a user-set crossfade window, replacing fade-out→silence→fade-in; keeps the existing bitrate/sleep-timer interplay.
- **Data-saver mode**: Settings toggle capping bitrate at 96 via the existing maxBitrate mechanism and disabling the "gapless warm" Range probe.
- **Weekly Mix**: auto-generated member playlist ("Weekly Mix") refilled Mondays from `playCounts` seeds → `/songs/:id/suggestions`, surfaced on Discover.
- **Family activity feed**: opt-in per-member recent-plays feed via `GET /api/family/activity` reading the existing server-side `/api/me/library` store; members toggle sharing on/off, display names from Clerk.

Explicitly out of scope (infra-blocked per audit): Spotify Connect handoff, real-time Jam/collaborative playlists, podcasts/audiobooks/video, lossless, ML-grade Discover Weekly.

## Capabilities

### New Capabilities

- `content-controls`: hidden songs/artists blocklists and the explicit-content filter — the "negative taste" and family-safety surfaces.
- `family-activity`: opt-in per-member recent-plays feed backed by the existing per-user server library store.

### Modified Capabilities

- `playlists`: sort menu + drag-to-reorder replace arrow-only reordering.
- `search`: debounced typeahead suggestions under the input.
- `playback`: true overlapping crossfade via dual `<audio>` elements + data-saver mode.
- `discovery`: Weekly Mix auto-generated member playlist.

## Impact

- **Client**: `PlaylistDetailView` (sort menu, drag), `SearchView` (typeahead dropdown), `TrackMenu` (hide entries, explicit badge), `App.jsx` (blocklist/explicit/data-saver state, dual audio elements, weekly-mix generation hook), `Sidebar` (new Settings rows: hidden content, explicit filter, data-saver, activity sharing opt-in), `DiscoverView` (Weekly Mix rail, hidden/explicit filtering), `utils.js`/`personalData.js` (blocklist + settings keys), `queue`/`pickSuggestions`/`extendQueue` (blocklist-aware suggestions).
- **Server** (`src/server.js`): new `/api/search/suggestions` proxy route; `GET /api/family/activity` endpoint + opt-in flag stored in `/api/me/library` doc.
- **Sync**: `hiddenSongs`/`hiddenArtists`/`explicitFilter`/`dataSaver`/`shareActivity` join the synced library doc so prefs follow the member across devices (consistent with existing settings sync).
- **Tests**: blocklist filtering, weekly-mix seed selection, suggestions endpoint contract, explicit-flag normalization.
