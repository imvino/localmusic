# Design

## Context

Queue state lives in `App.jsx` (`queue`, `queueIndex`, `shuffleOrder`,
`shufflePos`, `repeat`). Song rows exist in `DiscoverDetailView` (TWO lists:
artist Popular Songs ~645-728 and album/playlist ~910-993) and `SearchView`
(rows are `<button>` elements — can't nest a `...` trigger button inside).
`playlistStore` follows the `downloadStore` zustand pattern but uses
`zustand/middleware` `persist` for nested data. Sidebar Library stubs at
`Sidebar.jsx:201-232` are gated behind `isSignedIn` — but likes/playlists are
anonymous-local, so the section shows for everyone. See proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Full collect→organize→replay loop entirely client-side
- One reusable `TrackMenu` used by all song rows (no separate SongRow —
  existing rows stay, menu plugs in)
- Queue ops that preserve the shuffle no-repeats invariant

**Non-Goals:**
- Server-side playlist storage / cross-device sync (ephemeral Render disk)
- Drag-and-drop reordering (up/down buttons)
- Share menu item (P1.2, next batch)

## Decisions

- **Playlist store**: `usePlaylistStore` with `persist` (key `playlists`) —
  `{ [id]: { id, name, songs: [], createdAt } }`. Songs stored as the full
  row-compatible object (incl. `duration`, `artists.primary`, `image` array)
  so rows render art/artist/duration with zero normalization; `isLocal` flag
  kept (staleness after new downloads is acceptable — `/api/stream/:id`
  resolves local files by id server-side regardless; only the badge lags).
  `audioPath` NOT stored (server path, meaningless client-side).
- **Queue mutation model: index-remap, never insert into `queue` mid-list.**
  `shuffleOrder` holds queue indices, so inserting into `queue` silently
  shifts every index ≥ insertion point — forbidden. All inserts append to
  `queue` end; position is expressed via `shuffleOrder`:
  - `playNext(song)`: append to `queue` → insert its index into
    `shuffleOrder` at `shufflePos + 1`. Non-shuffle: splice into `queue` at
    `queueIndex + 1` is safe ONLY when shuffle is off (no permutation to
    desync) — simpler uniform rule: append to queue and, when shuffle off,
    the queue IS the order so also append at queueIndex+1 via splice.
    (Final: shuffle off → splice at queueIndex+1; shuffle on → queue.push +
    order.splice(shufflePos+1).)
  - `addToQueue(song)`: `queue.push` + `shuffleOrder.push` (when on).
  - `removeAt(i)`: remove `queue[i]` → in `shuffleOrder`, drop `i` and
    decrement all entries > `i`; adjust `queueIndex`/`shufflePos` when the
    removed item precedes them. Removing the current song advances to the
    next in play order.
  - `move(displayPos, dir)`: swap positions within the *displayed* order —
    under shuffle swap `shuffleOrder` entries; else swap `queue` entries.
  - `clear()`: `queue = [currentSong]`, `queueIndex = 0`, order rebuilt
    (keeps current song playing — Spotify clears upcoming only).
  - `playAt(displayPos)`: display position → `shuffleOrder[pos]` →
    `queueIndex` (identity when shuffle off).
  Played-prefix of the permutation survives every op → "no repeats until
  exhausted" holds.
- **Empty-state ops**: with nothing playing (`queueIndex = -1`), Play next /
  Add to queue just plays the song (queue becomes `[song]`).
- **QueueDrawer**: play-order list keyed by position (not `song.id` —
  duplicates are legal). Drawer ≥md, bottom sheet on mobile triggered from
  `FullScreenPlayer` (miniplayer has no room); z-index above bottom nav (z-40)
  and miniplayer (z-30). Ops on display positions.
- **TrackMenu**: `createPortal` to `document.body`, `position: fixed` from
  trigger rect, flips up near viewport bottom (scroll containers clip
  absolutely-positioned children — portal is required). SearchView rows
  convert `<button>` → `div role="button" tabindex=0` so the trigger nests
  legally. Items: Play next, Add to queue, Add to playlist (inline picker),
  Like/Unlike (live `likedSongs` Set + `onLikeToggle` passed as props, not
  snapshots), Go to album (disabled when no albumId).
- **Liked view order**: newest first (`likedSongs` serializes oldest-first —
  reverse). Resolves via `/api/songs?ids=` in 50-id chunks; results re-keyed
  by id and emitted in liked order (upstream order not guaranteed); failures
  skipped. Unlike via live `onLikeToggle` prop → re-renders list.
- **`GET /api/songs?ids=` route**: OUTSIDE the `!isProduction` gates (serves
  prod). Cap 50 ids server-side. Normalize `fetchWithFallback`'s three return
  shapes (`{success,data}`, `{data}` bare, `null`) → `{success, data:[]}`.
  Decorate each song with `isLocal: isSongLocal(id)` (safe on prod — returns
  false without MUSIC_DIR). Same pattern as `server.js:866`.
- **Context Play/Shuffle buttons**: play the *displayed* list (post-filter/
  sort) as the queue. `onShufflePlay(songs)` enables shuffle then clicks a
  random index so the permutation anchors there.

## Risks / Trade-offs

- [Index-remap bugs desync the permutation] → ops are few and spec-scenario
  covered; smoke test specifically mutates mid-shuffle
- [Stored playlist song shape goes stale vs upstream metadata] → acceptable —
  fields used are stable (id/name/artist/album/art); stream URL is rebuilt
  deterministically at play time anyway
- [50-id cap could drop liked songs] → chunk client-side into 50/call batches
- [`createPortal` menu + fixed positioning on iOS safari] → standard pattern;
  flip-up handled; test on the phone viewport
