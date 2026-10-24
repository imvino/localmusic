# Tasks

## 1. Offline audio (workbox)

- [x] 1.1 `vite.config.js`: add `/\/api\/stream\//i` CacheFirst runtime cache with RangeRequestsPlugin, statuses [0,200,206], 200 entries / 30d; add `workbox-range-requests` as explicit devDep if needed. Verify: `pnpm build` regenerates sw.js containing a stream route.

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
