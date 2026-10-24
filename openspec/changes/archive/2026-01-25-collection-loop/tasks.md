# Tasks

## 1. Store + server

- [x] 1.1 Create `src/stores/playlistStore.js` — zustand `persist` (key `playlists`): createPlaylist(name), renamePlaylist, deletePlaylist, addSong(pid,song) (dedupe by id — return 'exists'), removeSong, moveSong(pid,from,to). Store the full row-compatible song object (incl. `duration`, `artists.primary`, `image` array, `isLocal`; NOT `audioPath`). Verify: reload persists playlists.
- [x] 1.2 Add `GET /api/songs?ids=` in `src/server.js` OUTSIDE `!isProduction` gates: cap 50 ids; `fetchWithFallback('songs', {ids: csv})`; normalize all 3 return shapes ({success,data} / {data} / null) → `{success,data:[]}`; decorate each song `isLocal: isSongLocal(id)`. Verify: `curl 'localhost:3001/api/songs?ids=_BildwDZ,BhKP6P-H'` returns 2 songs and the library id has `isLocal:true`.

## 2. Views + navigation

- [x] 2.1 `src/views/PlaylistsView.jsx` — playlist grid w/ create-rename-delete, song counts, navigate to detail. Route `/playlists`.
- [x] 2.2 `src/views/PlaylistDetailView.jsx` — `/playlists/:id`: song rows (TrackMenu), remove/reorder (up/down), Play + Shuffle header.
- [x] 2.3 `src/views/LikedSongsView.jsx` — `/liked`: read live `likedSongs` prop (not snapshot), resolve via `/api/songs?ids=` (50-chunks, re-key by id, emit in liked order NEWEST FIRST, skip failures), Play + Shuffle header, empty state; unlike removes from list.
- [x] 2.4 `Sidebar.jsx` Library section — visible for anonymous users too (drop `isSignedIn` gate): "My Playlist"/"Playlists" → `/playlists` + top playlists inline, "Liked Songs" → `/liked`; wire routes in `App.jsx`.

## 3. Queue drawer + track menu + context buttons

- [x] 3.1 `src/components/QueueDrawer.jsx` — play-order list (shuffle-aware) KEYED BY POSITION, current highlight, tap-to-play (displayPos→queueIndex map), remove, up/down on display positions, clear (keeps current); drawer (md+) / bottom sheet triggered from `FullScreenPlayer` (miniplayer lacks room); z-index above bottom nav (z-40) + miniplayer (z-30); queue button in `PlayerBar` desktop + `FullScreenPlayer`.
- [x] 3.2 `src/components/TrackMenu.jsx` — `createPortal` to body, `position:fixed` from trigger rect + flip-up near bottom (scroll containers clip absolute children); items: Play next, Add to queue, Add to playlist (inline picker), Like/Unlike, Go to album (disabled without albumId); close on outside-click/Escape. Convert SearchView rows `<button>` → `div role="button" tabindex="0"` + Enter key, so the trigger nests legally.
- [x] 3.3 App.jsx queue ops (index-remap model — NEVER insert into `queue` mid-list under shuffle): `playNext` (shuffle off → splice at queueIndex+1; on → queue.push + order.splice(shufflePos+1)); `addToQueue` (push + order.push); `removeAt` (drop index from order + decrement >i; adjust queueIndex/shufflePos; removing current → next in play order); `move`/`clear`/`playAt` on display positions; empty-queue ops → play song; `handleShufflePlay(songs)`. Verify: mutate mid-shuffle keeps played-prefix invariant.
- [x] 3.4 Wire TrackMenu into BOTH DiscoverDetailView lists (Popular Songs tab ~645 + album/playlist ~910), SearchView rows, LikedSongsView, PlaylistDetailView — pass `likedSongs` Set + `onLikeToggle` as props; Play + Shuffle buttons on DiscoverDetailView (plays the displayed/filtered list) + LikedSongsView + PlaylistDetailView headers.

## 4. Integration check

- [x] 4.1 Smoke: playlist CRUD → add via menu → reorder → play → reload; liked resolves newest-first + local badge + unlike; queue ops under shuffle preserve invariant + clear keeps current + empty-state play; menu flips up on last row; SearchView rows keyboard-playable; no console errors.

## Workflow follow-up

- Milestone critic re-run; `openspec archive` after QA.
