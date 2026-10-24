# Design

## Context

All playback logic lives in `client/src/App.jsx` (~900 lines): `queue`,
`queueIndex`, `shuffle` (bool), `repeat` (bool), `currentBitrate`, and
`previousBitrateRef` drive `handleNext`/`handlePrev`/`onEnded`. The
`/api/stream/:id?bitrate=N` endpoint already serves any bitrate, so no server
work is needed. See proposal.md — Why for the four bugs being fixed.

## Goals / Non-Goals

**Goals:**
- Correct shuffle/repeat/bitrate behavior and gapless transitions
- Local history + session resume, zero new backend surface
- Keep everything client-side and production-path safe

**Non-Goals:**
- Autoplay/radio on queue end (P0.4, next change)
- Cross-device history sync (needs server state; deferred)
- Refactoring App.jsx into smaller modules (out of scope — keep the diff
  reviewable in one file)

## Decisions

- **Shuffle model: permutation array, not random index.** Maintain
  `shuffleOrder` (Fisher-Yates over queue indices) + `shufflePos`. Next/Prev
  walk the order; Prev rewinds the order. Toggling shuffle builds the order
  with the current song at the current position so playback continues
  uninterrupted. Alternative considered: "recently played" exclusion set —
  rejected because it still allows repeats and breaks Prev semantics.
- **Repeat as enum string `'off'|'all'|'one'`, newly persisted** inside
  `playerSession` (nothing persists repeat today — no migration clause
  needed). UI: PlayerBar icon gains a `1` badge in `one` (lucide
  `Repeat`/`Repeat1`). Manual Next/Prev still navigate under `one`; the mode
  only affects `ended` handling.
- **Deterministic stream URLs replace per-song resolution.** Remote songs
  play via `${API_BASE}/api/stream/:id?bitrate=${currentBitrate}` and local
  songs via `/api/stream/:id` — the proxy endpoint already does upstream
  resolution + fallbacks, so `playQueueSong`/`handleSongSelect` no longer
  block on `/api/song/:id` to start playback (that call only enriches
  metadata like `downloadUrl`, and can go async/skip). This fixes three
  bugs at once: the dead `fetch()`+`res.url` swap, the 320-vs-96 label
  fiction, and the transition stall. `previousBitrateRef` becomes
  *last-applied bitrate*, updated inside the switch effect — not in
  `handleTimeUpdate` where synchronous writes keep it equal. Switching is
  skipped for local songs (`bitrate` ignored server-side) and `maxBitrate`
  is set on every song, not just the first-clicked one.
- **Prefetch warms the stream endpoint, not metadata.** With deterministic
  URLs there's no resolution fetch to prefetch — at ~15s remaining, fire a
  `Range: bytes=0-1` request against the next item's `/api/stream` URL to
  warm TCP/TLS + server-side upstream resolution. Target = the item that
  would actually play next under current shuffle order/repeat mode, not
  `queueIndex + 1`. Failures are silent.
- **History + session: two localStorage keys.** `playHistory` (append-only,
  capped 200, consecutive-dedup, recorded on successful play not selection)
  and `playerSession` (queue/index/song/position/repeat/shuffle, written on
  a ~5s throttle during playback, 24h TTL). On resume, stream URLs are
  rebuilt deterministically — persisted CDN URLs are never trusted — and
  `currentTime` restores inside a `loadedmetadata` handler (set earlier and
  it's silently discarded). Resume via a one-shot "Resume playback?"
  toast/banner — not autoplay (browsers block it anyway).
- **Recently Played in DiscoverView** reuses the existing `HorizontalScroll`
  card row — consistent with current conventions.
- **Stale-queue guard**: when a song is selected without an explicit queue
  (`handleSongSelect` with no `songQueue`), the queue is cleared so Next
  can't teleport into an unrelated stale queue.

## Risks / Trade-offs

- [Shuffle order invalidates on queue mutation] → rebuild order on
  `setQueue`, keeping current song position
- [`audio.src` swap loses buffered range / brief rebuffer] → acceptable; only
  fires on genuine bitrate change, ~1s restore
- [localStorage quota (~5MB) with artwork URLs] → cap history at 200, store
  only fields the row renders
- [Resume prompt is a UX interrupt] → single non-blocking toast, auto-dismiss
