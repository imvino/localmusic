# Proposal

## Why

The spotify-critic baseline found four quietly-broken playback behaviors and
no playback memory: the adaptive-bitrate switcher is dead code (and would
double-download the stream if it ever fired), shuffle replays songs (random
pick, no permutation), repeat is a single boolean that conflates repeat-one
and repeat-all, track changes leave an audible gap while the next stream
resolves, and a page reload loses queue/song/position entirely. These are
table-stakes behaviors a Spotify user expects to already work — fixing them
matters more than any new feature.

## What Changes

- **Adaptive bitrate**: remote songs currently play a raw JioSaavn CDN URL
  (~320kbps) while state claims 96kbps — the switcher is dead code AND would
  downgrade a 320 stream if it ever fired. Stream remote songs through the
  deterministic `/api/stream/:id?bitrate=N` proxy URL from the start, then
  switch by reassigning `audio.src` directly (no `fetch()` — it downloads the
  whole body just to read `res.url`), preserving position and play state.
  Local songs keep `/api/stream/:id` and skip switching entirely (server
  ignores `bitrate` for local files). `maxBitrate` must also propagate to
  queue-advanced songs — it currently only sets on the first-clicked song.
- **Shuffle**: replace per-skip `Math.random` with a Fisher-Yates permutation
  generated on toggle; next/prev walk the permutation so no song repeats
  until all are heard; toggling preserves the current song.
- **Repeat**: replace the boolean with a 3-state cycle `off → all → one`
  (Spotify semantics): `all` wraps the queue at the end, `one` replays the
  current track, `off` stops at queue end.
- **Gapless prefetch**: with deterministic stream URLs, the remaining stall
  is server-side upstream resolution + TTFB — warm it ~15s before song end
  with a tiny range request against the next track's stream URL (the item
  that would actually play under current shuffle/repeat).
- **Listening history**: record each play to localStorage and surface a
  Recently Played row on Discover.
- **Session resume**: persist `{queue, queueIndex, currentSong, currentTime,
  repeat, shuffle}` and offer "Resume" on reload; stream URLs are rebuilt
  deterministically on resume rather than trusting persisted (expiring) CDN
  URLs, and position restores after `loadedmetadata`.

## Capabilities

### New Capabilities

- `playback`: queue navigation semantics (next/prev, shuffle ordering,
  repeat modes), adaptive bitrate switching, and track-transition
  prefetching — the observable behaviors of the audio player.
- `listening-history`: recording plays, surfacing recently-played items,
  and restoring an interrupted playback session.

### Modified Capabilities

(None — no specs exist yet under `openspec/specs/`)

## Impact

- **Code**: `client/src/App.jsx` (bitrate switch effect, `handleNext`,
  `onEnded`, `handleSongSelect`, new history/persistence effects);
  `client/src/views/DiscoverView.jsx` (Recently Played row);
  `client/src/views/PlayerBar.jsx` + `FullScreenPlayer.jsx` (3-state repeat
  icon); `client/src/utils.js` (permutation helpers if added).
- **APIs**: none — reuses existing `/api/stream/:id?bitrate=` and
  `/api/song/:id` endpoints. Prefetch may add at most one early
  `/api/song/:id` call per track.
- **State**: new localStorage keys `playHistory`, `playerSession`; `repeat`
  becomes a 3-value enum, newly persisted inside `playerSession` (nothing
  persists repeat today, so no migration needed).
- **Risk**: contained to the client; no prod/server changes. Backward
  compatible — old persisted values are migrated, not broken.
