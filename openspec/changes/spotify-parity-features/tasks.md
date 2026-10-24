# Tasks

## 1. Quick wins (independent, low risk)

- [x] 1.1 Artist header: render `followerCount` (compact K/M format); degrade silently when absent
- [x] 1.2 Sidebar + LibraryView: liked-songs count next to "Liked Songs"
- [x] 1.3 Offline banner on top of existing `useHealthCheck` signal + `online`/`offline` events; two states ("No internet" vs "Server unreachable")
- [x] 1.4 Private session: persisted toggle, guard `playHistory`/`playCounts`/`lastPlayed` writes in `handlePlaying`, sidebar toggle + indicator chip
- [x] 1.5 Downloads storage meter: `storage.estimate` quota + summed `audio-downloads` cache blob sizes; degrade to item count when unsupported

## 2. Personalization rails (member-only)

- [x] 2.1 "New from artists you follow" rail: pure name-normalizer helper in `sync.js` (vitest-covered, shared with 2.2 clustering) mapping trending `artists[].name` objects → match vs `followedArtists` localStorage names; `isSignedIn` gate
- [x] 2.2 Daily Mixes: cluster `playCounts` by artist → top-3 → seed from user's own top-played songs per cluster + fill to ~20 via ONE `/api/songs/:id/suggestions` call per mix; never call `/api/artist/:id`; `daily-mix-{n}-{date}` cache key

## 3. Family Blend (client-only)

- [x] 3.1 `encodeBlendShare`/`decodeBlendShare` helpers (≤50 ids, local ids excluded, minimal metadata) + tests
- [x] 3.2 `BlendView` at `/blend/:data`: decode → `/api/songs` batch resolve → intersect vs likes+history+counts → "N songs in common"; guests preview creator's songs with overlap/save gated via `requireAuth` (pending action survives sign-in + pull via AuthGate)
- [x] 3.3 Save merged playlist: `slimSong` each resolved song before `importPlaylist` (strips `downloadUrl` bloat); "Create Blend" entry point using top-50 `playCounts` ids — disabled/hidden when the user has <5 play-count entries

## 4. Interaction polish

- [x] 4.1 Extract `useSwipeAction` hook from FullScreenPlayer gesture code (axis-lock, 64px threshold, <30° deviation) + `touch-action: pan-y` on rows + visual feedback (row slides with finger, reveals queue/heart icon, click suppressed after completed swipe)
- [x] 4.2 Apply swipe-left→queue / swipe-right→like on rows in DiscoverDetailView, PlaylistDetailView, LikedSongsView; guest like → `requireAuth`; non-touch no-ops
- [x] 4.3 Albums tab: render first 50 + "Show all" expands from the already-fetched array (client-side only — no refetch, no `page` param exists)

## 5. Wrapped-lite

- [x] 5.1 `WrappedView` at `/wrapped` (ProtectedRoute): count-weighted top songs/artists/minutes; `ts:0`/missing → all-time bucket; empty state for zero counts
- [x] 5.2 Verify CDN sends `Access-Control-Allow-Origin` on artwork hosts; canvas card loads each image `crossOrigin='anonymous'` with per-image failure tolerance; text-only card only when ALL artwork fails
- [x] 5.3 `canvas.toBlob` → `navigator.share({files})` with text fallback; link from StatsView header

## 6. Playlist folders (schema + tombstones — mirrors playlists 1:1)

- [x] 6.1 `playlistStore`: `folders` map + `playlist.folderId` + folder CRUD; `deleteFolder` writes `addTombstone('folders', id)` and un-files member playlists
- [x] 6.2 `sync.js`: `TOMB_KEYS.folders='removedFolders'`; `slimFolders`; `slimPlaylists` carries `folderId`; push sends `folders` + `removedFolders`; `PERSONAL_KEYS` gains `removedFolders`
- [x] 6.3 Server PUT: **`safePlaylists` gains `folderId`** (without it the server strips assignments and a device's own pull deletes its folders); accept `folders`/`removedFolders`; union folders by id (newest `updatedAt` wins); union tombstones; drop folders where `tomb.ts > createdAt`; clear `folderId` on member playlists **only for folders killed by the tomb filter** (age guard — restored folders with newer createdAt keep members)
- [x] 6.4 Client pull: fold server folder tombstones into local (existing TOMB_KEYS loop), merge folders playlist-style, filter by tomb, un-file members of killed folders only; defensive guard — local `folderId` wins when the server playlist copy lacks the field
- [x] 6.5 PlaylistsView collapsible folder groups + Sidebar nested folder names (**pinned wins**: pinned playlists render flat regardless of folder)
- [x] 6.6 BackupControls export/import gains `folders` + `removedFolders`; import restamps timestamps + `clearTombstone('folders', id)` per folder, preserving `playlist.folderId` membership
- [x] 6.7 vitest: cross-device folder delete propagates; concurrent add-to-deleted-folder leaves playlist un-filed not lost; **folder assignment survives a pull on the assigning device** (the C1 regression); backup restamp survives merge

## 7. Verify

- [x] 7.1 `npx vitest run` — all green (blend, folder, swipe-hook cases included)
- [x] 7.2 `npm run build` clean; `node --check src/server.js`; backend restart + stream 200
- [x] 7.3 Browser pass: verify `VITE_CLERK_PUBLISHABLE_KEY` present in the running env (else all guest/member scenarios are vacuous); guests see none of the new member features AND can preview a Blend link; playback regression check; swipe manually verified on a touch device
