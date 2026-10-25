# Design

## Context

The app's sync model (per-member `localStorage` + `/api/me/library` doc with dedicated tombstone kinds), dual-upstream proxy pattern (`PRIMARY_API`/`FALLBACK_API` in `src/constants.js`), and guest/member gating are established. Code facts verified for this design:

- `moveSong(id, from, to)` exists in `playlistStore` and bumps `updatedAt` → reorders sync for free. `QueueDrawer` uses **HTML5 DnD** (`draggable`/`onDragStart`/`onDrop`); touch-browser DnD support is inconsistent (Chrome Android does long-press drag, Safari doesn't) — arrows are the defined touch path.
- `smoothTransitions` is a **boolean** today — there is no duration choice. The duration selector is net-new UI.
- Suggestion injection has **two** paths, not one funnel: `extendQueue`/`pickSuggestions` (autoplay + song radio) AND `handleArtistRadio`'s own merge — the filter must cover both.
- `explicitContent` is NOT normalized to top-level on all payloads: `normalizeResults` never sets it on search results, and suggestions/autoplay/mix feeds are raw fetches that bypass the React Query decode boundary. `isContentBlocked` must check both `song.explicitContent` and `song.more_info?.explicit_content`.
- Fallback upstream 404s on `/search/suggestions` (verified live) but `/search/songs` works and returns `explicitContent` per song.
- `data saver` must cap `maxBitrate` — the existing "Low Data" quality option already does this correctly; rewriting the stream URL alone gets overridden by the adaptive upgrade effect within seconds.
- The search input lives in `App.jsx`'s header (two instances: mobile + desktop), NOT in SearchView.
- The server PUT handler whitelists known fields (`server.js` ~235) — `shareActivity`, `displayName`, `hiddenSongs`, `hiddenArtists`, and their tombstones must be added explicitly or they are dropped. `requireUser` only extracts `payload.sub` — `displayName` cannot be derived server-side from the token; Clerk lookup via `clerkClient.users.getUser` is the fallback (secret key already configured).
- `loadUserData` loads one doc per request — the activity endpoint scans N docs (`data/users/*.json`), which is new but trivial at household scale.
- Tombstone kinds are an enumerated set on BOTH sides: client `TOMB_KEYS` in sync.js is table-driven for the pull merge (auto-adopts new kinds), but `pushSnapshot` (useLibrarySync.js) is ALSO a hardcoded enumeration — the push body + its tombstone lines must list the six member keys or nothing ever reaches the server. The **server PUT block is likewise a hardcoded enumeration** extended per kind.
- `createPlaylist(name)` generates its own id — a deterministic-id create path (`createPlaylistWithId`) is net-new store surface.
- `slimPlaylists` (client) and `safePlaylists` (server) enumerate playlist fields — `weeklyMix`/`weeklyMixWeek` are dropped today and must be added to both, or the mix marker never round-trips.
- Playlist merges **union song lists in both directions** — `weekly-mix` needs an explicit replace rule keyed on `weeklyMixWeek` in BOTH merges or refills grow unboundedly.
- `clearPersonalData` is a **denylist** wipe over `PERSONAL_KEYS`: member keys must be listed to be wiped; unlisted keys (the guest keys) survive — which is exactly the guest-scope mechanism.
- In no-Clerk builds `isSignedIn` is always true — guest-scoped paths don't exist in that config; verification notes it.

## Goals / Non-Goals

**Goals:**
- Every item buildable without new infra (no websockets, no new server storage, no new deps).
- Zero regressions in the converged sync layer — new synced keys follow the dedicated-tombstone + always-merge pattern; un-hide tombstones get their OWN kinds (never `removedSongs`/`removedArtists`, which would unlike songs).
- Guests get device-local blocklist + data-saver under guest-scoped keys excluded from the user-switch wipe.

**Non-Goals:**
- Real-time anything (activity feed is pull-on-visit).
- ML personalization — Weekly Mix is heuristic.
- Manual-skip crossfade — natural advance only (flagged until stable).
- Podcasts, Connect, collaborative playlists (infra-blocked).

## Decisions

### D1 — Suggestions endpoint: proxy-with-fallback, never hard-fail
`/api/search/suggestions?q=` tries upstream `search/suggestions` per base; on 404/timeout falls back to `search/songs?limit=5`; returns compact `{songs, albums, artists, playlists}` groups (songs include `explicitContent`); always 200 on upstream failure; 4s timeout. Client: raw fetch + sequence counter for latest-query-wins. **Dropdown is owned by App.jsx's header inputs** (two instances share one component + state).

### D2 — Content controls: dedicated tombstone kinds + explicit merge fn + guest keys
`hiddenSongs`/`hiddenArtists` store `id → {id, name, artist, album, image, duration, hiddenAt}` (mirrors `likedMeta` so Settings rows render without lookups). Merge = a shared `mergeHiddenMap(local, server, tombKey)` per-item `hiddenAt` LWW + `tomb.ts <= hiddenAt` filter, run in the client pull merge AND the server PUT — mirroring the `likedMeta` merge. Un-hide tombstones go to NEW kinds `removedHiddenSongs`/`removedHiddenArtists` — registered in `TOMB_KEYS` + server PUT block — because reusing `removedSongs` would make an un-hide unlike a liked song (tombstone-newer-than-`likedAt` semantics). Re-hide after un-hide survives naturally (new `hiddenAt` postdates the tomb; no tombstone clear needed).

Key layout: member keys `hiddenSongs`/`hiddenArtists`/`explicitFilter`/`dataSaver` (+ the two tombstone keys) — all added to `PERSONAL_KEYS` so they wipe on user-switch. Guest keys `guestHiddenSongs`/`guestHiddenArtists`/`guestDataSaver` — deliberately absent from the wipe list. A `blocklistKeys(isSignedIn)` selector picks the set at each call site.

`isContentBlocked(song)` checks: hidden song id, normalized primary artist vs hiddenArtists (`normalizeArtistName`, same as followed rail), explicit flag in BOTH field shapes when filter on. Consumed at: `pickSuggestions`/`extendQueue`, `handleArtistRadio` (its base `pool` filtered BEFORE `startIdx` selection AND its merged suggestions — filtering only `merged` leaves hidden songs audible as the radio's start), queue-build paths (play-all/shuffle), rail mappers, search results, typeahead.

Playback semantics: hidden = suppressed from passive surfaces (rails, radios, mixes, play-all/shuffle queues); explicit user intent (tap row, Add to queue) still plays it — no silent no-ops.

### D3 — Dual-element crossfade, natural-advance only
Two `<audio>` refs. At `duration - crossfadeSec` on the natural-advance path, the idle element preloads the next song's stream URL (bitrate at prefetch time), `play()`s at volume 0, `requestAnimationFrame` interpolates volumes. Commit = outgoing element ends or fades to 0 → detach its listeners → swap roles.

**Handler ownership model** (not "patch-and-suppress"): listeners are bound per-element at role assignment. The secondary gets only what it needs to crossfade — its `playing`/`timeupdate`/`ended` are inert: it never writes `playHistory`/`playCounts` (no phantom plays on abort), never drives progress UI, MediaSession position, adaptive bitrate, or the warm probe. Every mutation (seek, pause, bitrate, sleep-timer, visibility-resume, volume) targets the element currently audible; the 500ms `handlePlaying` fade-in is suppressed on the secondary; repeat-one never starts a secondary (`getNextQueueIndex` returns null). Manual skips/queue-replace keep the existing path AND abort any in-flight crossfade. If the secondary fails to load/play, the transition completes via the existing hard-cut path — the spec requires this, not just notes it as a risk. The warm probe is skipped while crossfade prefetch is active (no double-fetch near song end).

Duration selector (new UI): chip-popover with off/1s/3s/5s/10s, replacing the boolean; `'on'` migrates to `3s`.

**Rejected:** Web Audio API — breaks the `<audio>` contract (bitrate switch, MediaSession, lyrics seek); manual-skip crossfade — ~10 single-element paths would need rework before it's safe.

### D4 — Weekly Mix: marker-identity, deterministic id, replace-merge
Playlist identity = `weeklyMix: true` marker, never the name. Creation uses a new `createPlaylistWithId('weekly-mix', …)` store path (existing `createPlaylist` generates its own id). `weeklyMix`/`weeklyMixWeek` are added to `slimPlaylists` AND server `safePlaylists` so they round-trip. Both merges give `weekly-mix` **replace semantics keyed on `weeklyMixWeek`**: newer `weeklyMixWeek` (tie → `updatedAt`) wins the `songs` array wholesale; the generic union path skips this playlist, or week-2 refills double it. Deletion writes a normal playlist tombstone; regen is blocked only while `tombstone.ts >= current week start` — a tombstone from a prior week must not block a new week.

### D5 — Family activity: read-only scan + Clerk name resolution
`GET /api/family/activity` (auth'd) scans `data/users/*.json`: for each doc with `shareActivity === true`, emit `doc.history.slice(0,10)` rows (the doc field is `history`, not `playHistory`); merge-sort desc; cap 50. `memberName`: `doc.displayName` first, else `clerkClient.users.getUser(userId)` → firstName → "Member", cached back into the doc (`@clerk/backend` is already a root dep; `clerkClient` exists in server.js). The PUT whitelist is extended for `shareActivity` + `shareActivityAt` + `displayName` + hidden lists/tombstones — and `shareActivity` merges by **`shareActivityAt` comparison on BOTH server PUT and client pull** (newest write wins) so a stale device's push can't re-enable sharing after an opt-out.

**Rejected:** dedicated activity collection — duplicates history that already syncs.

### D6 — Data-saver: cap `maxBitrate`, reuse the Low Data mechanism
`dataSaver` → `startBitrateFor`/quality resolution caps at 96 (identical mechanism to the existing Low Data option, so adaptive upgrades can't exceed it) + skips the warm Range probe. No "artwork prefetch" cap — `ArtImage` already `loading="lazy"` and nothing prefetches; nothing to disable there.

## Risks / Trade-offs

- **Dual-audio** is still the highest-risk change; mitigated by natural-advance-only + abort-on-manual-action + handler-detach-at-commit spec requirements. Fallback if element-B fails: existing fade path.
- **`/search/suggestions` upstream availability is genuinely unknown** (fallback 404s; primary unreachable during audit) — mitigated by the song-search fallback; spec requires behavior not a path.
- **Explicit-flag coverage is spotty** upstream — treated as clean when absent; documented expectation that some explicit tracks slip through.
- **Hide-artist is name-based** — near-name false positives possible, acceptable for household use.
- **Activity endpoint scans N files** — fine at household scale; would need indexing at real scale (out of scope).
- **SwipeableRow vs drag**: playlist rows already have horizontal swipe actions — desktop HTML5 drag is orthogonal (vertical drag on a `draggable` handle doesn't collide with the touch swipe path since HTML5 DnD doesn't fire on touch).
