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
| Playback | Done | Stream proxy w/ range support, queue state, shuffle, repeat, seek, volume, mute, media-session, keyboard shortcuts |
| Quality | Bugged | Bitrate preference exists; adaptive-switch code is dead (see P0.5) |
| Library | Done | 416 local albums (owner only), download-to-library manager |
| Likes | Partial | Liked songs persisted to localStorage but **no screen shows them** |
| Search | Partial | JioSaavn search works; no debounce/autocomplete/recent/filters |
| Discovery | Done | Discover feed, artist/composer pages, YouTube Tamil charts |
| Auth | Partial | Clerk UI-gates the client; no backend verification (accepted for now) |
| PWA | Partial | Manifest + SW (API cache only, no audio offline) |
| Library section | Stub | Sidebar "My Playlist / Recently Played / Offline Music" = "Soon" |

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
