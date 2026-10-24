# Tasks

## 1. Playback correctness (App.jsx)

- [x] 1.1 Replace `repeat` boolean with `'off'|'all'|'one'` state + `cycleRepeat()`; update `onEnded` (one→replay, else→next), `handleNext` (off→stop at end, all→wrap), PlayerBar + FullScreenPlayer icons (`Repeat`/`Repeat1`), and the `KeyR` shortcut; persist the value inside `playerSession` (no persisted key exists today — nothing to migrate). Manual Next/Prev still navigates under `one`. Verify: button cycles 3 states; each mode matches spec scenarios.
- [x] 1.2 Implement shuffle permutation: `shuffleOrder` (Fisher-Yates of indices) + `shufflePos`, built on toggle with current song preserved; `handleNext`/`handlePrev` walk the order; Prev at permutation start restarts the song (>3s rule still applies first); order resets anchored to the new song when the queue is replaced. Verify: 10-song queue plays all 10 once; Prev within 3s returns the previously heard song.
- [x] 1.3 Deterministic stream URLs + real bitrate switching: set `streamUrl = ${API_BASE}/api/stream/${id}?bitrate=${currentBitrate}` for remote songs and `/api/stream/${id}` for local (skip `/api/song/:id` resolution for playback — keep it only if needed for `downloadUrl` metadata, non-blocking). `previousBitrateRef` becomes last-*applied* bitrate, updated inside the switch effect — never in `handleTimeUpdate`. Switch = direct `audio.src` swap + `currentTime`/`play()` restore; skip switching entirely for local songs; set `maxBitrate` in `playQueueSong` too. Verify: no full-body fetch in network tab; `?bitrate=` requests appear on switch; position continues within ~1s; local songs issue no `?bitrate=` requests.
- [x] 1.4 Next-track warm: in `handleTimeUpdate`, when <15s remain, compute the item that would actually play next (shuffle order / repeat-aware, not `queueIndex+1`) and fire `fetch(streamUrl, {headers: {Range: 'bytes=0-1'}})`; silent on failure. Verify: range request appears in network before `ended`; transition no longer stalls.
- [x] 1.5 Stale-queue guard: when `handleSongSelect` is called without `songQueue`, clear `queue`/`queueIndex` so Next can't jump into an unrelated queue. Verify: single-song play → Next stops instead of teleporting.

## 2. History + resume

- [x] 2.1 Add `playHistory` localStorage writer fired on successful playback start ({id,name,artist,album,image,timestamp}, consecutive-dedup, cap 200). Verify: localStorage grows per play, survives reload, failed plays don't record.
- [x] 2.2 Render Recently Played row in `DiscoverView` via `HorizontalScroll` from `playHistory` (unique songs, newest first, hidden when empty); tapping plays the song. Verify: row appears after plays and items are playable.
- [x] 2.3 Persist `playerSession` ({queue,queueIndex,currentSong,currentTime,repeat,shuffle,ts}) throttled ~5s during playback + on `beforeunload`; on mount, if session <24h old, show Resume toast restoring queue/song/modes; rebuild stream URLs deterministically (never trust persisted CDN URLs) and restore position inside `loadedmetadata` handler. Verify: reload mid-song → resume → position restored; stale session discarded.

## 3. Integration check

- [x] 3.1 Manual smoke: build + HMR clean; `/api/stream` verified 206 audio at 96/320 for remote + local. Interactive UI QA pending user verification.
- [x] 3.2 Post-review fixes (milestone critic): sync `currentSong.streamUrl` in bitrate-switch effect (P0 reset regression); `maxBitrate` + enrichment on resume; `isLocal`/`audioPath` propagation via non-blocking `handlePlay` rewrites in DiscoverView + DiscoverDetailView; adaptive-bitrate gating for local songs; `getNextQueueIndex` null under repeat-one; drop `currentTime` from session deps; `setIsPlaying` in playQueueSong; end-of-queue play restarts; seekto accepts 0.

## Workflow follow-up

- Re-run spotify-critic for the milestone review after archive.
- `openspec archive` once all tasks are checked.
