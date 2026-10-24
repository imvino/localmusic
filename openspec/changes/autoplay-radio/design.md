# Design

## Context

Upstream evidence: `GET {FALLBACK_API}/songs/:id/suggestions` returns
`{success, data: [full song objects]}` (verified live). `saavn.sumit.co`
(primary) was unreachable during probing — the route must try both proxies.
Artist responses already carry `bio` (string|JSON) + `similarArtists` —
server normalizes them at `server.js:2356-2386`; the client just doesn't
render them.

## Goals / Non-Goals

**Goals:** never-ending playback; one-tap radio; render existing artist data.

**Non-Goals:** collaborative/authenticated "radio stations", algorithmic
personalization beyond upstream suggestions, on-device caching of radio
seeds.

## Decisions

- **`GET /api/songs/:id/suggestions`**: try PRIMARY then FALLBACK
  `/songs/{id}/suggestions` directly via axios (fetchWithFallback's official-
  API tier has no suggestions equivalent — stop after the two proxies).
  `timeout: 6000` on both calls — axios defaults to no timeout and a hung
  primary means dead air at queue end. Normalize to `{success, data: []}`,
  filter no-id ghosts, decorate `isLocal`, cap 50.
- **Queue epoch guard**: `queueEpochRef` incremented on every queue mutation
  (handleSongSelect + all queue ops). `extendQueue` captures the epoch (and
  seed song id) before the async fetch; if either changed at resolve time,
  bail — prevents suggestions landing on a queue the user already replaced.
- **Autoplay trigger**: in `handleNext` (and `onEnded`'s delegation to it) —
  when `getNextQueueIndex()` returns null AND repeat is `off` AND
  `autoplayEnabled` → `extendQueue(currentSong.id)`:
  - fetch suggestions, filter `queue` members + last-20 `playHistory` ids
    (read localStorage inside the function — never stale state), take 20
  - `newQueue = [...queue, ...picked]`; `setQueue(newQueue)`; bump epoch
  - non-shuffle: `setQueueIndex(queueIndex+1); playQueueSong(queueIndex+1, newQueue)`
  - shuffle: `newOrder=[...shuffleOrder, ...newIndices]`;
    `setShuffleOrder(newOrder); setShufflePos(shufflePos+1);
    setQueueIndex(newOrder[shufflePos+1]);
    playQueueSong(newOrder[shufflePos+1], newQueue)`
  - `autoplayToastShownRef` — toast once per continuous chain; reset on any
    user-initiated `handleSongSelect`
  - `autoplayAttemptedRef` — one fetch per queue-end event; **reset in
    `playQueueSong`/`handleSongSelect`** so each new track start re-allows
    attempts (chain re-extends past each +20 batch)
  - Early prefetch: in the warm block, when `getNextQueueIndex()` is null +
    autoplay on, pre-fetch suggestions into `pendingSuggestionsRef` so the
    first extension doesn't cold-start with a fetch gap
- **Autoplay state**: `autoplayEnabled` (default true, persisted
  `localStorage 'autoplay'`), toggle in the sidebar Settings area.
- **Song radio**: `handleSongRadio(song)` → `setShuffle(false)` first (radio
  is ordered, and a persisted shuffle would strand appended suggestions in
  `shuffleOrder`), then `handleSongSelect(song)` (queue `[song]`), then
  append fetched suggestions to the tail.
- **Artist radio**: `handleArtistRadio(songs)` — seed = shuffled first 25 of
  the view's normalized `songs` list (the displayed catalog), starts
  instantly via `handleSongSelect(..., songs.slice(0,25), rand, true)`;
  then suggestions for the first 3 seed ids append (deduped) — **indices
  appended to `shuffleOrder` end** since artist radio runs shuffled.
- **similarArtists id fix (server)**: normalization at server.js:2371 prefers
  `perma_url` slug over `a.id` — non-numeric ids route to the degraded
  search-fallback branch with no bio/similar. Prefer `a.id` when present,
  slug as fallback.
- **Bio sanitization**: strip HTML tags + `decodeHtmlEntities` before render;
  collapse >300 chars behind Show more/less.
- **Persisted-session cap**: queue can grow ~20/extension indefinitely —
  `playerSession` serializes the whole queue every 5s into a ~5MB shared
  quota. Persist only a window (queue.slice(queueIndex, queueIndex+50)) plus
  absolute index, rebuild offset on resume.
- **Bio + similarArtists**: DiscoverDetailView artist branch — bio paragraph
  with "Show more" toggle when >~300 chars; HorizontalScroll of artist
  circles (reuse ArtistCard pattern — circular images, name); navigate via
  `navigate('/discover/artist/'+id)`.
- **TrackMenu**: add "Go to song radio" item (Radio icon) wired via
  `onSongRadio` prop.

## Risks / Trade-offs

- [Suggestions endpoint flaky/empty] → single attempt + graceful stop; no
  retry storms
- [Autoplay appends mid-render → stale queue in handlers] → always pass the
  fresh list into `playQueueSong(index, list)` (param exists)
- [Append-only model stays intact] → suggestions only ever append to queue
  end (+ order end under shuffle) — no mid-inserts, invariant holds
- [Radio fetch latency] → playback starts on seed songs instantly;
  suggestions merge in after — never blocks the first note
