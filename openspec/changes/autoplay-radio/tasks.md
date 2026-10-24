# Tasks

## 1. Server

- [x] 1.1 Add `GET /api/songs/:id/suggestions` in `src/server.js` (prod-safe, outside `!isProduction` gates): try `PRIMARY_API/songs/:id/suggestions` then FALLBACK, `timeout: 6000` both; normalize `{success,data}`/`{data}`/null → `{success,data:[]}`; filter no-id ghosts; decorate `isLocal`; cap 50. Verify: `curl localhost:3001/api/songs/_BildwDZ/suggestions` returns song list quickly.
- [x] 1.2 Fix similarArtists normalization (~server.js:2371): prefer `a.id` over `perma_url` slug so similar-artist navigation lands on full artist pages. Verify: artist endpoint returns numeric ids for similarArtists.

## 2. Autoplay

- [x] 2.1 `autoplayEnabled` (persist `localStorage 'autoplay'`, default true) + toggle in Sidebar settings area. `queueEpochRef`++ on every queue mutation (handleSongSelect + queue ops).
- [x] 2.2 `fetchSuggestions(songId)` helper + `extendQueue(seedId)` in App.jsx — epoch+seed guard before fetch, bail if changed at resolve; filter queue members + last-20 `playHistory` ids (read from localStorage); take 20; append to queue (+ indices to `shuffleOrder` end under shuffle); explicit shuffle/non-shuffle play calls per design; `autoplayAttemptedRef` one-shot per queue-end, **reset inside `playQueueSong` and `handleSongSelect`**; `autoplayToastShownRef` once per chain, reset on handleSongSelect. Verify: extension adds ≤20 deduped songs, chain re-extends.
- [x] 2.3 In `handleNext`/`onEnded`: `getNextQueueIndex()` null + repeat `off` + autoplay → `extendQueue`; failure/empty → normal stop (verify via DevTools offline). Early prefetch: warm block pre-fetches suggestions into `pendingSuggestionsRef` when no next + autoplay on.
- [x] 2.4 Persisted session: store only `queue.slice(queueIndex, queueIndex+50)` window + absolute index; rebuild on resume (queue growth bounded vs 5MB localStorage quota).

## 3. Radio

- [x] 3.1 `handleSongRadio(song)` — `setShuffle(false)` then `handleSongSelect(song)`; append fetched suggestions to tail. Verify: radio plays seed then similar, shuffle off.
- [x] 3.2 `handleArtistRadio(songs)` — `handleSongSelect(rand, songs.slice(0,25), rand, true)` (shuffled, starts instantly); suggestions for first 3 seeds merge (dedup) + indices appended to `shuffleOrder` end. Verify: plays immediately, queue mixes artist + similar.
- [x] 3.3 TrackMenu "Go to song radio" (`onSongRadio`) — all 6 call sites: DiscoverView:286, SearchView:200, PlaylistDetailView:131, LikedSongsView:117, DiscoverDetailView:765+1041; prop drilled through route elements in App.jsx. Verify: menu shows it everywhere.

## 4. Artist profile content

- [x] 4.1 DiscoverDetailView artist branch: render `data.bio` (strip HTML tags + decodeHtmlEntities, collapse >300 chars w/ Show more) + `similarArtists` HorizontalScroll (circle art, name, navigate). Verify: both render; absent data → no empty sections.
- [x] 4.2 Artist header "Radio" button next to Play/Shuffle → `handleArtistRadio(songs)` (the normalized filtered `songs` list). Verify: starts shuffled mix.

## 5. Integration

- [x] 5.1 Smoke: album end → autoplay continues + toast once + re-extends on second exhaustion; autoplay off → stops; song/artist radio; bio/similar render; similar-artist nav lands on full page; build passes.

## Workflow follow-up

- Milestone critic re-run; archive after verification.
