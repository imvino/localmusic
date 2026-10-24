# Design

## Context

- `vite-plugin-pwa` 1.3.0 + workbox-build 7.4.1 already generate sw.js;
  existing runtimeCaching only covers the dead `saavn.sumit.co` host.
- `<audio crossOrigin="anonymous">` is already set — Web Audio can graph it
  if the server sends CORS headers (express `cors()` does, verify prod).
- `playHistory` in localStorage is the stats source (`{id,name,artist,
  image,duration,playedAt}` on every `playing` event).

## Decisions

- **Offline**: add a second `runtimeCaching` entry in `vite.config.js`:
  `urlPattern: /\/api\/stream\//i`, `handler: 'CacheFirst'`,
  `plugins: [new RangeRequestsPlugin()]`, `cacheableResponse: {statuses:[0,200,206]}`,
  `expiration: {maxEntries: 200, maxAgeSeconds: 30d}`. Import
  `RangeRequestsPlugin` from `workbox-range-requests` (already a transitive
  dep of vite-plugin-pwa — add as direct devDep to be safe).
- **Sleep timer**: App state `sleepTimer: null | {type:'timer',endsAt}|{type:'eot'}`.
  Interval checks `Date.now()>=endsAt` → `audioRef.current.pause()` + toast;
  `eot` handled in `onEnded` (clear flag, don't advance). Sidebar select UI.
- **Stats**: `StatsView` computes from `playHistory` on mount — group by id
  for top songs (count + artwork), by artist name for top artists, sum
  durations for minutes. Route `/stats` + Sidebar link.
- **EQ**: one `AudioContext` + `MediaElementAudioSourceNode` created once
  (lazily on first enable or on mount if persisted-enabled), three
  `BiquadFilterNode`s (lowshelf 200Hz / peaking 1kHz / highshelf 3kHz) →
  destination. Never disconnect — "off" = all gains 0. Persist
  `{enabled,low,mid,high}` in localStorage. Apply on mount and whenever
  settings change. Guard `setTargetAtTime`/linearRamp vs instant `gain.value`.
- **Crossfade**: persisted `smoothTransitions` flag. On track change/end,
  if on: ramp `audio.volume` to 0 over ~400ms, swap src, ramp back to the
  user's set volume over ~400ms (fade curves via rAF or
  `setInterval`; keep `volume` state authoritative — restore after fade).

## Risks / Trade-offs

- [MediaElementSource breaks if CORS headers missing on stream] → verify
  `/api/stream` sends `Access-Control-Allow-Origin` on both origins; if prod
  fails, EQ simply outputs silence — gate the feature on a HEAD check? No —
  too clever. Ship, and if the deployed API lacks CORS the fix is a server
  header, one line.
- [RangeRequestsPlugin + CacheFirst with 206s] → workbox handles ranges on
  cached full responses; verified pattern from workbox recipes.
- [EQ latency first-enable] → context.resume() on user click only.
