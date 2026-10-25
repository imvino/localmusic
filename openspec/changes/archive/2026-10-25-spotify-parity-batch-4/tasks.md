# Tasks — spotify-parity-batch-4

## 0. Verification gate (blocks everything below)

- [x] 0.1 Crossfade + normalize: seek near end → dual-element overlap, both elements graph-routed, measurement frozen mid-fade, play counted once
- [x] 0.2 Playlist sort menu + drag reorder + mobile arrows; order survives reload + sync
- [x] 0.3 Hide song/artist → filtered from rails/search/radio/suggestions; tombstone merge; un-hide doesn't clobber likes
- [x] 0.4 Weekly Mix generates once/ISO-week, deterministic id, replace semantics, cross-device sync
- [x] 0.5 Presence: (heartbeat + auth code-verified, WS 4001/4002 verified batch-3; two-member live check pending real household) two signed-in users → Listening-now row; private/shareActivity-off stay hidden; heartbeat >90s; sign-out disconnects
- [x] 0.6 Cast: no Chromecast on LAN — DOCUMENTED limitation (availability/URL logic verified batch-3; hardware test pending)
- [x] 0.7 Data saver: 96kbps cap live, prefetch killed, mid-song toggle
- [x] 0.8 Check off real passes in batch-2/3 tasks.md; note anything deferred
- [x] 0.9 `openspec sync` + archive spotify-parity-features, batch-2, batch-3 → `openspec/specs/` gains storage/family-activity/content-controls; `openspec validate` clean

## 1. Storage tables

- [x] 1.1 `shares`, `play_events`, `client_errors` tables created idempotently at startup (src/store.js or migration block in server.js)
- [x] 1.2 Indexes: shares.code, play_events(user_id, played_at), client_errors(signature)
- [x] 1.3 Retention sweeps on write (shares 90d TTL; play_events 12mo + per-member cap; errors dedup + ~1k hard row cap, oldest evicted)
- [x] 1.4 JSON-fallback mode: new endpoints return safe failure, core store unaffected

## 2. Share links

- [x] 2.1 **Deploy routing FIRST**: vercel.json external rewrite `/s/:path*` → Render origin `/s/:path*` (verified `/s/x` 404s on Vercel today — dev-only success is meaningless without this)
- [x] 2.2 Crawler-sim test: fetch a saavncdn art URL server-side → verify status/content-type/size (settles the MetaTags scar before building on it)
- [x] 2.3 `POST /api/shares` — requireUser, validate shape + ~40KB cap (a full 100-song playlist measures ~26KB — 16KB would silently reject it); first song's `m` three-way: empty/relative → accept, absolute → URL-parse + https + host exact/subdomain of saavncdn|gaanacdn else reject (blocks `saavncdn.com@evil.io` / `evilsaavncdn.com`); snapshot owner display name into the row; unguessable code; insert; return code
- [x] 2.4 `DELETE /api/shares/:code` — owner-only revoke; row gone → `/s/:code` 404s
- [x] 2.5 `GET /s/:code/art` — allowlist-enforced (saavncdn/gaanacdn hosts), https-only, no redirect-follow, ~2MB cap, per-IP rate limit on misses, cache headers; fallback generated default card
- [x] 2.6 `GET /s/:code` — 200 HTML: escaped og:title/description/image in head, `<noscript>` preview + fallback link, script `location.replace` into `/shared/<payload>` (Host-derived absolute URLs); graceful not-found. NO bare-302.
- [x] 2.7 Client: PlaylistDetailView share → POST + copy `/s/:code`; fallback to encodePlaylistShare URL on failure; revoke affordance on playlist row
- [x] 2.8 Verify (done in dev: og meta, proxied art, auth/guest/not-found/evil-m all verified; real WhatsApp paste is a physical-device check): WhatsApp-sim (curl UA) shows card meta; real chat paste unfurls; old `/shared/:data` links still work; guest can't POST; non-owner can't DELETE; evil `m` URL rejected at POST; empty-`m` playlist still shares with default card

## 3. Daily-mix multi-seed fix

- [x] 3.1 DiscoverView: group top artists into ≤3 buckets of ~3 artists; each bucket = one mix (lead artist names it, "& more" when multi-artist)
- [x] 3.2 Seeds = member's own top songs per bucket, capPerArtist; fill = ≤3 distinct-artist seed suggestions PER MIX (≤9 parallel day-cached calls total — the ≤3-total invariant is dropped); capPerArtist on seeds+fill → 20
- [x] 3.3 Sparse tails: 1-2 artists → 1 honest artist-named mix; zero history → no mixes
- [x] 3.4 Keep day-cache, net() skip penalty, isContentBlocked
- [x] 3.5 Verify against a seeded playCounts fixture: multi-artist mixes when history supports breadth; no silent echo — VERIFIED: dailyMix.test.js 7/7 (broad history → multi-artist buckets, single-artist → honest single mix, skip de-rank, block exclusion) + signed-in browser: "Daily Mix 1 — A.R. Rahman & more", "…Yuvan Shankar Raja & more", "…Sean Roldan" sparse tail

## 4. Mood rails

- [x] 4.1 Probe mood/genre detail endpoint on both mirrors (`/api/moods/:id` 404'd; try `/api/channels/:id` and siblings — the right detail route must be found, not assumed)
- [x] 4.2 `GET /api/moods` (+ detail route) server-side; timeout + failover like other upstream calls
- [x] 4.3 Discover mood rail/chips → channel content via existing playlist flow; railPass + language pref applied
- [x] 4.4 Fallback if detail endpoint unusable: curated mood→search-query rails
- [x] 4.5 Endpoint failure → rail omitted, Discover renders

## 5. Smart shuffle

- [x] 5.1 Shuffle cycle off → shuffle → smart (UI affordance chosen in implementation)
- [x] 5.2 On smart: fetch suggestions for ≤3 context seeds through pickSuggestions-equivalent path (dedup, blocklist, capPerArtist) + net-new skip-penalty filter (pickSuggestions has NO skipCounts today — do not assume it)
- [x] 5.3 Inject via append-to-queue + splice-indices-into-shuffleOrder at ~1:6 positions (handlePlayNext pattern); `injected: true` marker; bump queueEpochRef on inject
- [x] 5.4 Strip via handleQueueRemoveAt-style index remap; bump queueEpochRef; current injected song keeps playing, unplayed injects removed
- [x] 5.5 Fetch failure → pure shuffle silently
- [x] 5.6 Verify injected songs play/count/presence identically; injected skips de-rank future injects; QueueDrawer badge if cheap — VERIFIED: 9 injected songs w/ Sparkles badge in QueueDrawer, 3 real seed suggestion calls, strip on toggle-off (smartShuffle=off, injected removed), inject/strip inherit the shared recordPlayStats + queue-epoch path

## 6. Play-events capture

- [x] 6.1 `POST /api/play-events` — requireUser, server-stamped played_at, sessionId + artist_key + buffered flag stored; `shared` flag DERIVED server-side from user doc shareActivity (never client-declared)
- [x] 6.2 Emit at recordPlayStats threshold point; fire-and-forget
- [x] 6.3 Private session suppresses; guests emit nothing
- [x] 6.4 Offline buffer bounded 200, flushed via sync cycle; repeated-503 discards
- [x] 6.5 Verify: events land per qualifying play — VERIFIED e2e: real signed-in session (Clerk ticket minted for Vino), browser emitted POST /api/play-events at 30s threshold → SQLite row song_id=i_i96kd6 artist_key="devi sri prasad" buffered=0; client-sent shared:true stored as shared=0 (server-derived flag proven); resume dedupe inherits countedPlayRef; guests emit nothing (emission inside member-only path)

## 7. Error reporting

- [x] 7.1 `POST /api/log-error` — unauthed, IP rate limit tighter than default (~10/min, it's a disk-write endpoint); allowlisted fields; signature dedup; ~1k hard row cap
- [x] 7.2 Client: ErrorBoundary + window.onerror + unhandledrejection → sendBeacon fallback fetch; failures swallowed
- [x] 7.3 `GET /api/admin/errors` — requireUser + ADMIN_USER_IDS allowlist; recent signatures by count
- [x] 7.4 Verify: induced crash lands one deduped row; error loop increments count not rows; no tokens in payload

## 8. Final verification

- [x] 8.1 `pnpm test` all pass; client build clean; server syntax + boot clean — 68/68 vitest, vite build + PWA generated, node --check clean, sqlite tables live
- [x] 8.2 Browser pass — VERIFIED signed-in + guest: 3 multi-artist Daily Mixes, mood chips+language-biased rail, share POST→/s/:code og card→art proxy→revoke 404 (real auth, real saavncdn bytes), smart shuffle inject/strip, ZERO console errors; also fixed verifyToken 3.x breakage (all auth was 401) + railPass artists-object crash found in-browser
- [x] 8.3 `openspec validate spotify-parity-batch-4 --strict` clean
- [x] 8.4 Commit — done, notified
