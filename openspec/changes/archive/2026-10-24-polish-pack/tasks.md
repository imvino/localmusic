# Tasks

## 1. Offline audio (workbox)

- [x] 1.1 `vite.config.js`: `/^https?:\/\/[^/]+\/api\/stream\//` CacheFirst + `rangeRequests:true` + inline `requestWillFetch` Range-stripper plugin + statuses [0,200] + 100 entries / 30d / purgeOnQuotaError. (Workbox RegExp routes must match cross-origin hrefs from index 0 — an unanchored `/api/stream/` pattern never intercepts `:3001`/`onrender.com` requests.) Verified live on the built bundle: full `200` in `audio-cache`, replay + seek while backend unreachable.

## 2. Sleep timer

- [x] 2.1 App: `sleepTimer` state ({type:'timer',endsAt}|{type:'eot'}|null), interval check pauses + toast, `eot` clears on `onEnded` without advancing. Sidebar: select control wired through props. Verify: set 15m → timer state set, Off clears.

## 3. Stats view

- [x] 3.1 `StatsView.jsx` — totals (plays, est. minutes), top songs w/ artwork, top artists, liked count; guarded parse; empty state. Route `/stats` + Sidebar link. Verify: renders from seeded playHistory.

## 4. EQ + transitions

- [x] 4.1 `client/src/audio/eq.js` — lazily-created AudioContext + MediaElementSource + 3 BiquadFilters → destination; `setEqGains`, `applyPreset`, persisted `{enabled,low,mid,high}` in localStorage; gains applied on change; bypass = 0 gains (never disconnect).
- [x] 4.2 Sidebar EQ section — enable toggle, preset buttons, 3 sliders (dB). Wire through props into App.
- [x] 4.3 `smoothTransitions` persisted toggle in settings; in playQueueSong/handleNext path — ramp volume→0 (~400ms), swap, ramp back. Must restore `volume` state after ramp. Verify: skip with toggle on = audible fade.

## 5. Integration

- [x] 5.1 Smoke: build clean; EQ toggles without breaking playback (silence check); sw.js has stream rule; stats renders; sleep timer pauses.

## Workflow follow-up

- Milestone critic; archive all changes; commit + deploy.
