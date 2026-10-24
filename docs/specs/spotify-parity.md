# Spotify Parity Spec — Torsongs

Living backlog for the "Spotify alternative" marathon. Items are checked off as
they ship; the `spotify-critic` agent re-evaluates at each milestone.

## Architecture constraints (fixed)

- **Remote-first**: friends & family use the deployed app (Vercel client +
  Render server). Features must work over the JioSaavn-proxy production path.
- **Local-only**: `MUSIC_DIR` library routes are dev-mode only — they serve the
  owner's machine. Local-only features are lowest priority (audience of one).
- **No licensed-catalog features**: anything needing Spotify's licensing,
  podcasts, real-time multi-device sync, or a server-side social graph is out.
- Hobby project: unofficial-API fragility is accepted.

## What exists today

| Area | Status | Notes |
|------|--------|-------|
| Playback | Done | Stream proxy w/ range support, queue state, shuffle, repeat, seek, volume, mute, media-session, keyboard shortcuts; starts at 160kbps on fast conns |
| Quality | Done | Bitrate preference, adaptive switching (96→160→max), 3-band EQ, crossfade |
| Library | Done | 407 local albums browsable (Albums/Artists grid), local album detail, local search |
| Likes | Done | Liked Songs screen, sort control, batch download |
| Search | Done | Debounce, recent searches, browse tiles, local-library results |
| Discovery | Done | Discover feed (On Repeat / Repeat Rewind / Because-you-listened rails), artist/composer pages, YouTube Tamil charts |
| Auth | Done | Clerk sign-in/out UI + server session verification; likes/playlists sync across devices (JSON store) |
| Lyrics | Done | Karaoke sync, JioSaavn + LRCLIB sources, English translation toggle for regional songs |
| PWA | Partial | Manifest + SW (audio cache, downloads, install prompt) |
| Library section | Done | Sidebar Library hub + collection browser |

## Gap backlog (from spotify-critic baseline, 2026-10-24)

### P0 — core parity (collect → organize → replay loop)

- [ ] **P0.1 Playlists + Your Library** — zustand store persisted to localStorage
  (mirror `downloadStore`/`likedSongs` pattern): create/rename/delete playlists,
  add/remove/reorder songs, `/playlists` route, sidebar Library section.
  Server sync deferred (Render disk is ephemeral; needs free Postgres later).
- [ ] **P0.2 Liked Songs screen** — `/liked` route resolving the existing Set
  via `/api/songs?ids=` batch; reuse song-row list UI.
- [ ] **P0.3 Queue panel + track `...` menu + Play/Shuffle header buttons** —
  queue drawer (view/remove/reorder/clear), Add-to-queue/Play-next, context
  menu on song rows, Play + Shuffle buttons on album/playlist/artist headers.
- [ ] **P0.4 Autoplay + radio** — on queue end, fetch similar songs (JioSaavn
  suggestions endpoint, fall back to artist top songs) and append; "Go to
  radio" in track menu; render `similarArtists`+`bio` on artist page (data
  already fetched, unrendered).
- [ ] **P0.5 Playback correctness fixes** — (a) adaptive-bitrate dead code:
  `previousBitrateRef` set before `setCurrentBitrate` so switch never fires,
  plus it double-downloads the MP3 — replace with `audio.src` swap + position
  restore; (b) true shuffle permutation (Fisher-Yates, no repeats until
  exhausted); (c) 3-state repeat off→all→one (current boolean = repeat-one);
  (d) next-track prefetch near song end for gaplessness.
- [ ] **P0.6 History + resume** — `playHistory` localStorage on each play,
  Recently Played row on Discover, persist `{queue, queueIndex, currentTime}`
  and offer Resume on reload.

### P1 — high leverage

- [ ] **P1.1 Lyrics** — proxy `lyrics.getLyrics`, tab in FullScreenPlayer.
- [ ] **P1.2 Share/copy-link** — `navigator.share` on track menu + headers
  (routes + MetaTags already shareable).
- [ ] **P1.3 Wire dead endpoints into Discover** — `/api/charts`, `/api/trending`,
  `/api/new-releases`, `/api/trending-youtube`, `useJioFooterDetails` all ship
  data with zero consumers.
- [ ] **P1.4 Search quality** — debounce (currently 4 API calls per keystroke),
  autocomplete, recent searches, result filter tabs.
- [ ] **P1.5 Settings page** — autoplay toggle, explicit filter, quality,
  language picker (discovery hardcoded `language='tamil'`).
- [ ] **P1.6 Genre/mood tiles on Search landing**.

### P2 — polish

- [ ] **P2.1 Offline audio in PWA** — Cache Storage on `/api/stream`
  (CacheFirst + explicit download button); mind quotas + expiring URLs.
- [ ] **P2.2 Equalizer + crossfade** — Web Audio (`crossOrigin` already set).
- [ ] **P2.3 Sleep timer, playback speed, desktop full-screen player**
  (FullScreenPlayer is `md:hidden` today).
- [ ] **P2.4 "For You" + "Stats/Wrapped-lite"** — local-history-driven rows,
  no server recs.
- [ ] **P2.5 Save albums/follow artists → Library page; pin/sort/filter.**
- [ ] **P2.6 PWA install prompt** (`beforeinstallprompt`).
- [ ] **P2.7 Stream-regression script** — hit `/api/stream` local + remote,
  assert audio 200/206; seed for real tests.

## Won't build (infra-blocked)

Spotify Connect/device handoff/Jam, friend activity & collaborative playlists
& Blend (server social graph), podcasts/audiobooks/video, Discover Weekly-grade
personalization, native apps/CarPlay/widgets, lossless (>320kbps), AI DJ,
Spotify Codes, lyrics-synced timestamps (plain text only), remote-user uploads.
Backend auth hardening deferred unless abuse appears.

## Milestone log

- [x] Baseline critic report (agent 1154a045) — seeded backlog above
- [x] `playback-core-fixes` proposed + gated (APPROVE-WITH-CHANGES, 8 edits applied)
- [x] `playback-core-fixes` implemented — all 9 tasks
- [x] Post-impl review: BLOCKED → fixed — playback-effect src reset (P0),
  resume missing maxBitrate, isLocal dropped in view handlePlay paths
  (blocking fetches removed entirely), local-song adaptive gating,
  playQueueSong resume-play, seekto-0, session dep churn
- [ ] `playback-core-fixes` archive (pending interactive QA sign-off)
- [x] `collection-loop` proposed + gated (APPROVE-WITH-CHANGES — index-remap model,
  portal menu, prod-safe /api/songs, liked-order/edge-case scenarios applied)
- [x] `collection-loop` implemented — all 10 tasks; self-review caught stale-queue
  replay + shufflePos shift before critic returned
- [x] Post-impl review: no P0 — fixed P1 keydown stale-deps + Space double-fire,
  P2 hover-only mobile controls, move-past-cursor, menu scroll-detach,
  /api/songs local-fallback + ghost filter; added DiscoverView card menus
- [ ] `collection-loop` archive (pending interactive QA sign-off)
- [x] `competitor-marathon` (2026-10-24, no openspec change — direct sprint)
  - P0.1 Discover images: array image sources were rendered as `[object Object]`
    → `getImageSrc` normalizer + ArtImage (no-referrer, 500x500 upgrade,
    error fallback) across every view
  - P0.2 Clerk auth wired end-to-end: ClerkProvider, Spotify-style UserMenu,
    server session verification (`@clerk/backend`), GET/PUT `/api/me/library`
    → likes + playlists sync across devices (union merge, debounced push)
  - P0.3 English lyrics: `POST /api/translate` (Google gtx + MyMemory, cached);
    LyricsModal "English" toggle — karaoke lines translate 1:1 with timing kept
  - P1.1 Your Library browser: 407-album grid + artist index + search; local
    album detail; fuse.js local search with "From your library" results
  - P1.2 Batch download buttons (playlist/liked/local album), TrackMenu
    download works for local songs, Go-to-artist added
  - P1.3 Desktop now-playing lyrics (PlayerBar Mic2 → LyricsModal)
  - P1.4 On Repeat + Repeat Rewind rails from play history; playable Stats rows
  - P1.5 Search landing browse tiles (9 genres/artists), debounce already in
  - P1.7 Playback starts at 160kbps on fast connections (was 96 floor)
- [ ] Next backlog: sort in playlist rows, PWA stream-cache only for
  registry'd downloads, backup/restore export, vitest for utils

## Critic loop — rounds 2-4 hardening (commit 791226a)

- Sync correctness: pulls gated on pullDone, pushes deferred not dropped,
  tombstones for deletes (removedAlbums/removedArtists/historyClearedAt),
  server-side union merges for history + collections, reconnect re-pull on
  'online', express.json 2mb, AbortSignal pull timeout
- Security: /api/stream ?url= open proxy removed (SSRF)
- likedMeta syncs display metadata so local/delisted songs still render
- playCounts durable map feeds Stats + On Repeat (survives history cap)
- Queue: Spotify-style sections, artwork, HTML5 drag reorder
- Player: sleep timer sheet, ⋯ menu (mobile + desktop), seek onFinalChange
- A11y: aria-labels on transport + dialog roles + Escape/focus-return
- Pinning, inline create/confirm everywhere, Stats recently-played + clear
- 23 vitest cases covering image utils, sync merges, tombstones

## Rounds 5-6 (commits 3ce5a97, 2798d61)

- Tombstones extended to likes + playlists; playlist updatedAt for LWW
- Pull is always-merge (no blind replace): unpushed offline edits survive;
  server tombstones fold into local storage so deletes propagate both ways
- PERSONAL_KEYS covers all tombstone/meta/count keys — cross-account wipe
  complete on shared devices
- playCounts synced (object shape preserved through merge)
- Stream proxy: upstream host allowlist + per-IP rate limit; lang clamp
- UX: desktop Now Playing expand, find-in-playlist/liked, toast actions,
  playlist-delete Undo, backup-restore tombstone reconciliation
- 26 vitest cases
