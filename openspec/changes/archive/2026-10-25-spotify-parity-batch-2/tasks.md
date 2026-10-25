# Tasks

## 1. Playlist ergonomics (sort + drag reorder)

- [x] 1.1 Add sort menu to `PlaylistDetailView`: Custom (stored order, default) / Oldest / Title / Artist; view-only, `songs` array untouched; row numbers show display sequence on sorted views; header Play/Shuffle always use stored order
- [x] 1.2 Port `QueueDrawer`'s HTML5 DnD (draggable/dragstart/dragover/drop) to playlist rows → `moveSong(id, from, to)`; desktop path
- [x] 1.3 Keep up/down arrows as the defined touch path (touch-browser DnD is inconsistent); hide drag affordance + arrows while a non-custom sort is active
- [x] 1.4 Add a vitest covering `moveSong` reorder + `updatedAt` bump (no test exists today)

## 2. Search typeahead

- [x] 2.1 `GET /api/search/suggestions?q=` in `src/server.js`: try upstream `/search/suggestions` per base, fall back to `search/songs?limit=5`; normalize compact `{songs, albums, artists, playlists}` (songs carry `explicitContent`); 4s timeout; always 200
- [x] 2.2 Build the typeahead dropdown in `App.jsx` shared by BOTH header inputs (mobile + desktop): debounced fetch at ≥2 chars, sequence-counter latest-wins, grouped rows
- [x] 2.3 Click-to-play/navigate; Escape closes; ArrowUp/Down + Enter navigation bound to the active input; hide on empty/stale/blur-away
- [x] 2.4 Works signed out (search already guest-permitted)

## 3. Content controls (hide + explicit)

- [x] 3.1 Member keys `hiddenSongs`/`hiddenArtists`/`explicitFilter`/`dataSaver` + tombstone keys `removedHiddenSongs`/`removedHiddenArtists` (`id → {id,name,artist,album,image,duration,hiddenAt}` shape); guest keys `guestHiddenSongs`/`guestHiddenArtists`/`guestDataSaver`; `blocklistKeys(isSignedIn)` selector used at every call site; all six member keys added to `PERSONAL_KEYS` (guest keys stay out so guest hides survive member sign-in/out)
- [x] 3.2 `mergeHiddenMap(local, server, tombKey)`: per-entry `hiddenAt` LWW + `tomb.ts <= hiddenAt` filter — wired into client pull merge AND server PUT (mirror the likedMeta merge); register `removedHiddenSongs`/`removedHiddenArtists` in `TOMB_KEYS` + server PUT tombstone enumeration; un-hide NEVER writes `removedSongs`/`removedArtists`; extend `pushSnapshot`'s body + tombstone enumeration with all six member keys (the push is a hardcoded whitelist like the server PUT — without it the feature silently never syncs)
- [x] 3.3 `isContentBlocked(song)` in `utils.js`: hidden id OR normalized primary artist in hiddenArtists OR explicit (BOTH `explicitContent` and `more_info?.explicit_content`) when filter on
- [x] 3.4 TrackMenu: "Don't play this" + "Don't play this artist" — NOT auth-gated (guest writes to guest-scoped key); Settings → Hidden content management list rendering from stored metadata; un-hide writes dedicated tombstones
- [x] 3.5 Filter ALL injection paths: `pickSuggestions`/`extendQueue`, `handleArtistRadio` (filter its base `pool` BEFORE `startIdx` selection AND the merged suggestions — filtering only `merged` leaves hidden songs audible), play-all/shuffle queue-build, Daily/Weekly mixes; rails + search + typeahead when filter on
- [x] 3.6 Hidden songs render de-emphasized in playlists/liked/search but explicit tap + manual queue-add still play them; explicit rows get E badge + non-playable when filter on
- [x] 3.7 Server: normalize `explicitContent` top-level on `/api/search` results + `/api/songs/:id/suggestions` + `/api/search/suggestions`

## 4. True crossfade + data-saver (playback)

- [x] 4.1 Replace the `smoothTransitions` boolean with a duration selector (off/1s/3s/5s/10s) — chip-popover matching sleep-timer; migrate stored `'on'` → `3s`
- [x] 4.2 Add `nextAudioRef`; at `duration - crossfadeSec` on the natural-advance path only, preload + play() next queue song at volume 0, rAF linear crossfade, commit on ended/fade-done; skip the warm probe while crossfade prefetch is active (no double-fetch)
- [x] 4.3 Handler ownership: secondary's `playing`/`timeupdate`/`ended` are inert — no playHistory/playCounts writes, no progress/MediaSession/bitrate/probe drive; all mutations target the audible element; detach outgoing handlers at commit; suppress 500ms fade-in on secondary; abort in-flight crossfade on manual skip/queue-replace; repeat-one never starts secondary; secondary load/play failure falls back to the existing hard-cut path
- [x] 4.4 `dataSaver`: cap `maxBitrate` at 96 via the same mechanism as the Low Data quality option (NOT a URL rewrite), skip warm Range probe, show overridden state on the quality chip; idempotent with Low Data; member-synced + guest device-local; toggling mid-playback MUST re-run the select-time bitrate resolution (`currentBitrate` + `currentSong.maxBitrate`) — a toggle that waits for the next song fails the spec scenario

## 5. Weekly Mix (discovery)

- [x] 5.1 Add `createPlaylistWithId(id, name)` to playlistStore (existing `createPlaylist` generates ids) for deterministic `weekly-mix`
- [x] 5.2 Add `weeklyMix` + `weeklyMixWeek` to `slimPlaylists` (sync.js) AND server `safePlaylists` — marker must round-trip
- [x] 5.3 `weekly-mix` gets replace semantics keyed on `weeklyMixWeek` (tie → `updatedAt`) in BOTH `mergePlaylists` and the server PUT union — generic song-union must skip it
- [x] 5.4 On Discover mount (signed-in): find playlist with `weeklyMix: true`; create if absent (deterministic id); if `weeklyMixWeek` ≠ current ISO week → regenerate in place (top 3 `playCounts` artists → 1 suggestions call each → dedup vs hidden lists → replace `songs` `.slice(0, 30)`, bump `updatedAt`, set `weeklyMixWeek`); <3 distinct artists → skip; tombstone blocks regen only while `tomb.ts >= current week start`; renames preserved

## 6. Family activity

- [x] 6.1 Client: include `displayName` (Clerk profile) + `shareActivity`/`shareActivityAt` in `pushSnapshot`; server: extend PUT whitelist for those + hidden lists/tombstones; `shareActivity` merge compares `shareActivityAt` on BOTH server PUT and client pull (newest wins — off beats stale pushes)
- [x] 6.2 `GET /api/family/activity` (auth'd): scan `data/users/*.json` (guard `readdirSync` on missing dir → empty feed), only `shareActivity === true` docs, emit `{memberName, song, artist, image, ts}` merge-sorted desc capped 50 from each doc's `history`; `memberName` = `doc.displayName` → else `clerkClient.users.getUser` firstName → "Member" (lookup failure also falls back to "Member", never fails the feed; cache resolved name back); 401 guests; never emit non-opted fields; client pull writes resolved `shareActivity`/`explicitFilter`/`dataSaver` scalars back to the SAME localStorage keys App.jsx reads
- [x] 6.3 Settings → "Share my listening activity" toggle (default OFF) writing `shareActivity` + `shareActivityAt` + push
- [x] 6.4 Discover member section: "MemberName played Song" rows ("You" for own), tap-to-play, empty-state nudge when nobody shares, nothing rendered/requested for guests

## 7. Verification

- [x] 7.1 Vitest: `isContentBlocked` matrix (song/artist/explicit both field shapes), `moveSong` reorder + `updatedAt`, weekly-mix seed/dedup + week-keyed replace vs union (two-device same-week → one ≤30 mix), `mergeHiddenMap` LWW + tomb filter, un-hide tombstones do NOT touch `removedSongs`, `pushSnapshot` serialized body contains all six member keys + new tombstone kinds, crossfade state machine (secondary starts at duration−c, commit fires once, skip aborts, no history write from secondary)
- [x] 7.2 `npm run build` + `node --check src/server.js`
- [x] 7.3 Browser pass (mobile 390px + desktop): playlist drag + sort + arrows-on-touch, typeahead on both inputs + keyboard nav, hide/un-hide end-to-end incl. liked-song preservation, audible crossfade overlap, data-saver caps 96k through adaptive upgrades, Weekly Mix rail, activity opt-in/out + name fallback, guest invariants (note: no-Clerk builds have no guest mode — `isSignedIn` is always true)
- [x] 7.4 Sync regression: hide/un-hide across two sessions never unlikes; shareActivity opt-out wins vs stale push; user-switch wipes all six member keys while guest hides survive a member sign-in/out cycle

> Verification note: implemented and verified during apply + batch-4 gate (61/61 tests, build, live playback, endpoint checks). Presence two-member live check and Chromecast hardware test remain real-world pending.
