# Tasks — spotify-parity-batch-4

## 0. Verification gate (blocks everything below)

- [ ] 0.1 Crossfade + normalize: seek near end → dual-element overlap, both elements graph-routed, measurement frozen mid-fade, play counted once
- [ ] 0.2 Playlist sort menu + drag reorder + mobile arrows; order survives reload + sync
- [ ] 0.3 Hide song/artist → filtered from rails/search/radio/suggestions; tombstone merge; un-hide doesn't clobber likes
- [ ] 0.4 Weekly Mix generates once/ISO-week, deterministic id, replace semantics, cross-device sync
- [ ] 0.5 Presence: two signed-in users → Listening-now row; private/shareActivity-off stay hidden; heartbeat >90s; sign-out disconnects
- [ ] 0.6 Cast on real hardware if available; otherwise document limitation
- [ ] 0.7 Data saver: 96kbps cap live, prefetch killed, mid-song toggle
- [ ] 0.8 Check off real passes in batch-2/3 tasks.md; note anything deferred
- [ ] 0.9 `openspec sync` + archive spotify-parity-features, batch-2, batch-3 → `openspec/specs/` gains storage/family-activity/content-controls; `openspec validate` clean

## 1. Storage tables

- [ ] 1.1 `shares`, `play_events`, `client_errors` tables created idempotently at startup (src/store.js or migration block in server.js)
- [ ] 1.2 Indexes: shares.code, play_events(user_id, played_at), client_errors(signature)
- [ ] 1.3 Retention sweeps on write (shares 90d TTL; play_events 12mo + per-member cap; errors dedup + ~1k hard row cap, oldest evicted)
- [ ] 1.4 JSON-fallback mode: new endpoints return safe failure, core store unaffected

## 2. Share links

- [ ] 2.1 **Deploy routing FIRST**: vercel.json external rewrite `/s/:path*` → Render origin `/s/:path*` (verified `/s/x` 404s on Vercel today — dev-only success is meaningless without this)
- [ ] 2.2 Crawler-sim test: fetch a saavncdn art URL server-side → verify status/content-type/size (settles the MetaTags scar before building on it)
- [ ] 2.3 `POST /api/shares` — requireUser, validate shape + ~40KB cap (a full 100-song playlist measures ~26KB — 16KB would silently reject it); first song's `m` three-way: empty/relative → accept, absolute → URL-parse + https + host exact/subdomain of saavncdn|gaanacdn else reject (blocks `saavncdn.com@evil.io` / `evilsaavncdn.com`); snapshot owner display name into the row; unguessable code; insert; return code
- [ ] 2.4 `DELETE /api/shares/:code` — owner-only revoke; row gone → `/s/:code` 404s
- [ ] 2.5 `GET /s/:code/art` — allowlist-enforced (saavncdn/gaanacdn hosts), https-only, no redirect-follow, ~2MB cap, per-IP rate limit on misses, cache headers; fallback generated default card
- [ ] 2.6 `GET /s/:code` — 200 HTML: escaped og:title/description/image in head, `<noscript>` preview + fallback link, script `location.replace` into `/shared/<payload>` (Host-derived absolute URLs); graceful not-found. NO bare-302.
- [ ] 2.7 Client: PlaylistDetailView share → POST + copy `/s/:code`; fallback to encodePlaylistShare URL on failure; revoke affordance on playlist row
- [ ] 2.8 Verify: WhatsApp-sim (curl UA) shows card meta; real chat paste unfurls; old `/shared/:data` links still work; guest can't POST; non-owner can't DELETE; evil `m` URL rejected at POST; empty-`m` playlist still shares with default card

## 3. Daily-mix multi-seed fix

- [ ] 3.1 DiscoverView: group top artists into ≤3 buckets of ~3 artists; each bucket = one mix (lead artist names it, "& more" when multi-artist)
- [ ] 3.2 Seeds = member's own top songs per bucket, capPerArtist; fill = ≤3 distinct-artist seed suggestions PER MIX (≤9 parallel day-cached calls total — the ≤3-total invariant is dropped); capPerArtist on seeds+fill → 20
- [ ] 3.3 Sparse tails: 1-2 artists → 1 honest artist-named mix; zero history → no mixes
- [ ] 3.4 Keep day-cache, net() skip penalty, isContentBlocked
- [ ] 3.5 Verify against a seeded playCounts fixture: multi-artist mixes when history supports breadth; no silent echo

## 4. Mood rails

- [ ] 4.1 Probe mood/genre detail endpoint on both mirrors (`/api/moods/:id` 404'd; try `/api/channels/:id` and siblings — the right detail route must be found, not assumed)
- [ ] 4.2 `GET /api/moods` (+ detail route) server-side; timeout + failover like other upstream calls
- [ ] 4.3 Discover mood rail/chips → channel content via existing playlist flow; railPass + language pref applied
- [ ] 4.4 Fallback if detail endpoint unusable: curated mood→search-query rails
- [ ] 4.5 Endpoint failure → rail omitted, Discover renders

## 5. Smart shuffle

- [ ] 5.1 Shuffle cycle off → shuffle → smart (UI affordance chosen in implementation)
- [ ] 5.2 On smart: fetch suggestions for ≤3 context seeds through pickSuggestions-equivalent path (dedup, blocklist, capPerArtist) + net-new skip-penalty filter (pickSuggestions has NO skipCounts today — do not assume it)
- [ ] 5.3 Inject via append-to-queue + splice-indices-into-shuffleOrder at ~1:6 positions (handlePlayNext pattern); `injected: true` marker; bump queueEpochRef on inject
- [ ] 5.4 Strip via handleQueueRemoveAt-style index remap; bump queueEpochRef; current injected song keeps playing, unplayed injects removed
- [ ] 5.5 Fetch failure → pure shuffle silently
- [ ] 5.6 Verify injected songs play/count/presence identically; injected skips de-rank future injects; QueueDrawer badge if cheap

## 6. Play-events capture

- [ ] 6.1 `POST /api/play-events` — requireUser, server-stamped played_at, sessionId + artist_key + buffered flag stored; `shared` flag DERIVED server-side from user doc shareActivity (never client-declared)
- [ ] 6.2 Emit at recordPlayStats threshold point; fire-and-forget
- [ ] 6.3 Private session suppresses; guests emit nothing
- [ ] 6.4 Offline buffer bounded 200, flushed via sync cycle; repeated-503 discards
- [ ] 6.5 Verify: events land per qualifying play, no double-count on resume, private session writes nothing, shared flag follows the server-side doc not the request

## 7. Error reporting

- [ ] 7.1 `POST /api/log-error` — unauthed, IP rate limit tighter than default (~10/min, it's a disk-write endpoint); allowlisted fields; signature dedup; ~1k hard row cap
- [ ] 7.2 Client: ErrorBoundary + window.onerror + unhandledrejection → sendBeacon fallback fetch; failures swallowed
- [ ] 7.3 `GET /api/admin/errors` — requireUser + ADMIN_USER_IDS allowlist; recent signatures by count
- [ ] 7.4 Verify: induced crash lands one deduped row; error loop increments count not rows; no tokens in payload

## 8. Final verification

- [ ] 8.1 `pnpm test` all pass; client build clean; server syntax + boot clean
- [ ] 8.2 Browser pass: Discover mixes multi-artist, mood rail, share→short link→crawler card, smart shuffle on/off, zero console errors
- [ ] 8.3 `openspec validate --change spotify-parity-batch-4` clean
- [ ] 8.4 Commit; notify user
