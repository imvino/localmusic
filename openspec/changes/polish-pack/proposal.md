# Proposal: polish-pack

## Why

Final parity pass on everyday Spotify features: offline playback of
recently-heard songs, a sleep timer, listening stats, and sound shaping
(EQ + smooth track transitions). All are client-side feasible today —
Workbox is already bundled, `playHistory` already records listens, and the
`<audio>` element already runs `crossOrigin="anonymous"` (required for Web
Audio).

## What changes

- **Offline audio**: Workbox `runtimeCaching` rule for `/api/stream/`
  responses (any origin — dev is same-origin, prod is the Render API),
  CacheFirst + `RangeRequestsPlugin` so seek ranges replay offline, max 200
  entries / 30 days. Whatever you've already listened to keeps playing with
  no network. No explicit "Download" toggle (Storage is opaque; queued
  downloads are a bigger feature — deferred).
- **Sleep timer**: Sidebar setting (Off / 15 / 30 / 60 min / End of track) —
  pauses playback on expiry with a toast; "End of track" stops after the
  current song. Not persisted (a sleep timer is per-session by nature).
- **Listening stats**: `/stats` view — top songs, top artists, play counts
  and estimated minutes from `playHistory` + liked count. Local-only.
- **EQ**: 3-band Web Audio EQ (low/mid/high ±12dB) with presets (Flat, Bass
  Boost, Vocal, Treble), applied via `MediaElementSource` + `BiquadFilter`
  chain; enabled state + band values persisted. AudioContext created lazily
  on first enable (autoplay policy) and resumed on toggle.
- **Smooth transitions**: optional volume-ramp crossfade — fade out ~500ms
  into silence at track end/change, fade in on start. Persisted toggle.

## Capabilities

- `offline` — NEW
- `sleep-timer` — NEW
- `stats` — NEW
- `eq` — NEW (includes transitions)

## Impact

- **Client**: vite.config.js workbox rule, StatsView, Sidebar settings,
  App.jsx timer + EQ graph wiring
- **Server**: none — offline caching is pure service-worker
- **Risk**: MediaElementSource permanently hijacks the element's output —
  EQ graph created once and left connected (bypass = flat gains), never
  toggled off; CORS on `/api/stream` must allow the element — verify
  cross-origin fetch works on the prod API before shipping
