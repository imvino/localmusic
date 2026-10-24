# Design

## Context

- `vite-plugin-pwa` 1.3.0 + workbox-build 7.4.1 already generate sw.js;
  existing runtimeCaching only covers the dead `saavn.sumit.co` host.
- `<audio crossOrigin="anonymous">` is already set — Web Audio can graph it
  if the server sends CORS headers (express `cors()` does, verify prod).
- `playHistory` in localStorage is the stats source (`{id,name,artist,
  album,albumId,image,duration,ts}` — `duration`/`ts` added this change;
  older entries contribute 0 minutes).

## Decisions

- **Offline**: `runtimeCaching` entry: `urlPattern: /\/api\/stream\//i`,
  `handler: 'CacheFirst'`, `rangeRequests: true`, plus an inline plugin
  `requestWillFetch` that strips `Range` on cache-miss (206s are
  uncacheable — Cache API rejects partial responses; the full 200 body is
  what lands in cache, then rangeRequests serves seeks from it).
  `cacheableResponse: {statuses:[0,200]}`, `expiration: 100 entries/30d,
  purgeOnQuotaError`. Side effect accepted: the gapless `bytes=0-1` warmer
  now triggers a full download of the next track — effectively prefetch,
  good for offline. Feature exists only in the built SW (no devOptions);
  per-bitrate URLs mean up to 2-3 cache entries per song.
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
- **Crossfade**: persisted `smoothTransitions` flag. `fadeVolume()` rAF-ramps
  `audio.volume`; `fadingRef` guards the volume-effect write so the slider
  can't stomp the ramp. Fade-out runs only on skips (playQueueSong while
  playing); fade-in runs in the `playing` listener **only when
  `audio.currentTime < 1`** — `playing` also fires on resume/rebuffer, and
  fading there would dip mid-song. `volume` state stays authoritative.

## Risks / Trade-offs

- [MediaElementSource breaks if CORS headers missing on stream] → verify
  `/api/stream` sends `Access-Control-Allow-Origin` on both origins; if prod
  fails, EQ simply outputs silence — gate the feature on a HEAD check? No —
  too clever. Ship, and if the deployed API lacks CORS the fix is a server
  header, one line.
- [RangeRequestsPlugin + CacheFirst with 206s] → workbox handles ranges on
  cached full responses; verified pattern from workbox recipes.
- [EQ latency first-enable] → context.resume() on user click only.
