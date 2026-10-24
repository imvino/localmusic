# Tasks

## 1. Server — lyrics

- [x] 1.1 `GET /api/lyrics/:id` in `src/server.js`: resolve song (id,name,artist,duration via existing helpers/fetchWithFallback) → official `lyrics.getLyricsById` via `fetchFromMusicServiceOfficial` → LRCLIB `api/get?track_name&artist_name&duration` fallback → `{success,data:{lyrics,source}}` or `{success:true,data:null}`; 8s timeouts. Verify: `curl localhost:3001/api/lyrics/_BildwDZ` returns lyrics or clean null.

## 2. Lyrics UI

- [x] 2.1 `client/src/components/LyricsModal.jsx` — portal modal, scrollable lyrics, song header, unavailable state, Escape/backdrop close. `useQuery(['lyrics',id])` 5min stale.
- [x] 2.2 TrackMenu "View lyrics" item (`onViewLyrics` prop → App opens modal with song); lyrics button in FullScreenPlayer controls row. Verify: opens from both, playback continues.

## 3. Share

- [x] 3.1 `shareSong(song)`/`shareContext(type,{id,name})` helpers in App.jsx — `navigator.share` else clipboard + toast. Deep links: album `/discover/album/:id`, artist `/discover/artist/:id`, song → album link if albumId else `/search?q=name+artist`.
- [x] 3.2 TrackMenu "Share" item (all call sites get it via App) + Share button on DiscoverDetailView header (album+artist) next to Play/Shuffle/Radio. Verify: link copies + navigates back correctly.

## 4. Search polish

- [x] 4.1 Debounce query→useSearch 300ms in SearchView (`debouncedQuery` state). Verify: typing fast = 1 request.
- [x] 4.2 Recent searches on empty-query view — localStorage `recentSearches` (max 8, dedupe, newest-first), tap to run, Clear button; record on result click. Verify: shows, re-runs, clears.

## 5. Discovery rows

- [x] 5.1 `useCharts`, `useTrending`, `useFeaturedPlaylists` in hooks/useApi.js + HorizontalScroll rows in DiscoverView (Charts, Trending, Featured Playlists) routing by item type; skip empty rows. Verify: rows render from live endpoints.

## 6. Integration

- [x] 6.1 Smoke: lyrics modal from menu + player; share copies; debounced search + recents; new Discover rows navigate; build passes.

## Workflow follow-up

- Milestone critic; archive after verification.
