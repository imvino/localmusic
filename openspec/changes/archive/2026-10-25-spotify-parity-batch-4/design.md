# Design — spotify-parity-batch-4

Scope is the grill-corrected batch-4: verification gate + server share links
+ daily-mix multi-seed fix + mood rails + smart shuffle + play-events
capture + own-server error reporting. Essentia.js, Last.fm, co-play graph
UI, and local-file import were cut/deferred by the scope grill.

## D1 — Verification gate runs first, and archiving is part of it

Batch-2 shipped ~31 tasks and batch-3 ~30 with `tasks.md` boxes unchecked
and specs never synced — `openspec/specs/` lacks `storage`,
`family-activity`, `content-controls`. Every batch-4 item builds on that
surface. Gate order:

1. Verify the unverified machinery (below), check off real passes.
2. `openspec sync` + archive batch-1/2/3 so main specs reflect shipped code.
3. Then implement batch-4 features.

Unverified surface and the specific checks:

- **Crossfade + normalize**: seek near end → dual-element overlap plays,
  both elements get graph nodes, measurement freezes mid-fade, no silence,
  play counted exactly once (epoch/ownership guards from batch-3).
- **Playlist sort/drag**: desktop HTML5 drag + mobile touch arrows + sort
  menu; order persists through `moveSong` + sync merge.
- **Hide flow**: hide song/artist → filtered from rails, search, radio pool,
  suggestions; tombstone merge across two devices; un-hide doesn't clobber
  likes.
- **Weekly Mix**: generates once per ISO week, deterministic id, replace
  semantics on re-gen, syncs to a second device.
- **Presence**: two signed-in users on the same LAN → "Listening now" row;
  private session + shareActivity-off members stay invisible; heartbeat
  survives a long song (>90s); sign-out disconnects.
- **Cast**: verified on real hardware if a Chromecast is on the LAN; if not,
  document the limitation rather than claiming parity.
- **Data saver**: stream capped at 96kbps, warm-probe prefetch killed,
  mid-song toggle behavior.

## D2 — Share links: server table + rendered page, not middleware

**Storage**: `shares` table — `code` (PK, `crypto.randomBytes`-derived, ≥64
bits entropy, URL-safe), `payload` (the same `{v,n,s:[...]}` slim shape
`encodePlaylistShare` produces, JSON), `owner_id`, `created_at`,
`expires_at` (90-day rolling TTL, swept on write — cheap, no cron).

**Routes** (decided, not optional):
- `POST /api/shares` — `requireUser`, validates payload shape + size cap.
  **Cap is ~40KB**: a measured realistic 100-song playlist encodes to ~26KB
  JSON via `encodePlaylistShare`, so 16KB would reject legitimate large
  playlists and silently degrade to base64 — the exact failure this feature
  exists to kill. The first song's `m` (image) field is validated at write
  time with a three-way rule: empty/absent/relative → accepted (default
  card); absolute → must URL-parse as https with host equal-to-or-subdomain
  of `saavncdn.com`/`gaanacdn.com` (URL parser, never substring — blocks
  `saavncdn.com@evil.io` and `evilsaavncdn.com`), else rejected. Only the
  first song's `m` is validated since it's the only URL the proxy fetches.
  The owner display name is snapshotted into the share row at POST time
  (from the member's stored user doc — no Clerk lookup on the read path)
  so og:description can say "shared by <name>".
- `GET /s/:code` — **200 HTML** with og:title/description/image in `<head>`
  (absolute URLs derived from the request Host), a `<noscript>` block
  containing a rendered preview/fallback link, and a short `<script>` that
  `location.replace`s the human into `/shared/<payload>` on the SPA. This is
  the only option that satisfies both constraints: crawlers read head-only
  never execute JS; humans need the full app. A 302 redirect is REJECTED
  (crawlers don't reliably re-scrape hops); a "client-side `/s/:code` route"
  is REJECTED (no such route exists and crawlers can't see client-rendered
  meta anyway). The redirect target uses the page's own host so Vercel vs
  direct-Render hits both land correctly.
  - **vercel.json gets an external rewrite `/s/:path*` →
    `https://torsongs.onrender.com/s/:path*`** — verified `/s/x` 404s on the
    Vercel origin today; this task moves EARLY in implementation (it's the
    difference between works-in-dev and works-for-the-family). Direct Render
    URLs keep working regardless.
- `GET /s/:code/art` — allowlisted image proxy. **SSRF guard**: the stored
  `m` URL must parse as https AND match the allowlist
  (`*.saavncdn.com`, `*.gaanacdn.com`); https-only, redirect-following
  disabled, response size capped ~2MB, per-IP rate limit on misses, cache
  headers on hits. Non-allowlisted/missing art → the generated default card.
- All server-rendered HTML escapes user content (playlist names are member
  input — an unescaped `"` is an og:meta injection). Server re-validates its
  own copy; client-side length caps are not trusted.

**Revocation**: `DELETE /api/shares/:code` (owner-only) — a leaked share is
currently unkillable for 90 days; a one-line delete endpoint closes that.
Caveat: Vercel edge may cache the rendered HTML briefly after delete —
revocation is best-effort for already-scraped cards, immediate for new
fetches. The client surfaces revoke on the playlist row ("remove shared
link").

**The saavncdn scar** (from `MetaTags.jsx:8-14`, which filters CDN images to
a placeholder — evidence of past breakage): og:image MUST be app-origin.
The `/s/:code/art` proxy resolves it: absolute HTTPS URL on our origin,
fetchable by crawlers, no hotlink dependency. First implementation step is
a crawler-sim test (curl the upstream art URL; check status/type/size) — if
upstream art genuinely can't be fetched server-side either, fall back to a
generated SVG/PNG card (name + song count rendered into a branded default).
Never ship a broken og:image. (Scar's sibling, noted out-of-scope:
`MetaTags.jsx` itself still emits a `via.placeholder.com` fallback — a
third-party hotlink of the same class; fixing the SPA's own meta path is a
separate cleanup.)

**Client**: `PlaylistDetailView` share handler posts to `/api/shares`,
copies `origin + /s/:code` on success, falls back to `encodePlaylistShare`
URL on failure. `SharedPlaylistView` untouched; `/shared/:data` route stays.

**Guests**: can't create shares (member feature), but `/s/:code` and the
playlist preview are public — recipients need no login, matching the
existing guests-can-play posture.

## D3 — Daily mixes: port the Weekly Mix pattern, keep the 3-mix cap

Current defect (`DiscoverView.jsx:155-212`): each cluster = ONE artist;
fill = suggestions of `seeds[0]` only. Fix keeps the same structure and
budget — still ≤3 mixes, still day-cached — but re-shapes each mix. The
"≤3 suggestion calls total" invariant is DROPPED (it was the source of the
single-artist defect); the new budget is ≤3 calls per mix / ≤9 total, all
parallel inside the existing day-cached `useQuery`:

- **Bucketing**: the top artists by weighted plays group into ≤3 buckets of
  ~3 artists each — each bucket is one mix, named for its lead artist with
  "& more" appended when the bucket is multi-artist. Seeds are the member's
  own top-played songs from THAT bucket's artists, `capPerArtist` so none
  dominates. Bucket approach chosen over remixing single artists with
  strangers — matches Spotify's "mix per vibe-cluster" feel.
  - Sparse tail: 1-2 artists → 1 honest mix named for that artist
    (fabricated breadth is worse than an honest single-artist mix); 4-8
    artists → mixes for the buckets that exist. Artists are ranked, not
    promised.
- Fill: suggestions for up to 3 distinct-artist seeds **per mix** (parallel,
  day-cached), then `capPerArtist([...seeds, ...fill], 3)` sliced to 20.
- `net()` skip-penalty and `isContentBlocked` filtering apply exactly as the
  Weekly Mix path does (lines 234-262 are the reference implementation).

Zero new dependencies, zero new endpoints, ~60 lines changed in one file.

## D4 — Mood rails from editorial channels, not audio features

The upstream mirrors expose `/api/moods` and `/api/genres` (verified 200 on
the fallback host; song objects themselves carry no mood field). Rails:

- Server adds `GET /api/moods` (+ a channel-detail route once the detail
  endpoint shape is probed — `/api/moods/:id` 404'd, likely
  `/api/channels/:id` or similar; probing this is task 1 of the mood work).
- Client renders a "Moods" rail/chip row on Discover; selecting a channel
  opens its playlist/content list through the existing playlist/play flow.
- Rails pass through `railPass(blockCtx)` + language preference like every
  other rail. Endpoint failure → rail omitted.

If the channel-detail probe shows the mirror can't serve channel contents
reliably, degrade to a static curated list of mood→search-query mappings
("kuthu" → `search/songs?q=kuthu`) — editorial rails without a new API
dependency. That fallback is spec-compliant (still mood rails on Discover).

## D5 — Smart shuffle on the existing suggestion funnel

- Toggle: shuffle button cycles `off → shuffle → smart` (three-state, like
  Spotify's plain/enhanced cycle) or a separate chip — implementation picks
  whichever reads cleaner in `Contexts offer Play and Shuffle-Play`.
- Build: when smart is on, `handleShufflePlay` (and shuffle-play call sites)
  fetches suggestions for up to 3 seed songs from the context
  (`pickSuggestions`-equivalent path — same dedup-vs-history,
  `isContentBlocked`, `capPerArtist` machinery), then interleaves injected
  songs into the shuffled context at a ~1-in-6 ratio, max ~25% of final
  queue. Queue entries carry an `injected: true` marker so "turn it off"
  can strip them without reshuffling and so the QueueDrawer can badge them.
- **Queue discipline (mandatory mechanism)**: the queue model forbids
  mid-list `queue` insertion while a `shuffleOrder` permutation exists
  (App.jsx:1548-1550) — injected songs MUST be appended to `queue` and their
  new indices spliced into `shuffleOrder` at interleaved positions, exactly
  the `handlePlayNext` pattern (App.jsx:1552-1562). Inject AND strip MUST
  bump `queueEpochRef` — a mid-fade mutation otherwise lets `commitXfade`
  commit a stale nextIdx (App.jsx:843/876). Strip reuses the
  `handleQueueRemoveAt` index-remap pattern (App.jsx:1626).
- **Strip semantics**: turning smart shuffle off removes all *unplayed*
  injected entries from queue+permutation; if the currently-playing song is
  injected, it keeps playing (yanking a mid-listen song is worse UX) and the
  stripped permutation continues pure from the next position.
- **Negative signal (net-new machinery, not "existing")**: `pickSuggestions`
  applies dedup + `isContentBlocked` only — no skipCounts anywhere in the
  funnel today (verified: App.jsx:1737-1743 vs the only skipCounts use at
  L1971-1973, the recorder). Smart shuffle adds its own skip-penalty filter
  (`net()<0` excluded, like mix seeds); skipping an injected song records
  skips normally → self-correcting.
- Crossfade/normalize/presence treat injected songs identically to queue
  songs — they ARE queue songs once injected.
- Offline/fetch failure → pure shuffle silently.

## D6 — Play-events: capture now, consume never (this batch)

`play_events` table: `id` PK, `user_id`, `song_id`, `artist_key` (normalized
artist for cheap grouping), `played_at` (server-stamped), `session_id`
(client-generated per-session uuid, enables adjacency queries), `buffered`
flag (events flushed from the offline buffer can't feed realtime features).

- Emission: at the same point `recordPlayStats` fires (threshold-qualified
  plays only), `POST /api/play-events` with `{songId, artist, sessionId}` —
  fire-and-forget; on failure buffer to a bounded (200-entry) localStorage
  queue flushed by the existing sync cycle.
- Gates: signed-in only, private-session suppresses. The `shared` flag on
  each row is **server-derived** from the user doc (`doc.shareActivity ===
  true`) — same authoritative check the presence WS handler already uses;
  privacy flags are never client-declared.
- Retention: 12-month TTL + per-member row cap (sweep on write, like
  shares). Adjacency queries need recent windows, not eternity.
- **Durability honesty**: `data/app.db` persists only as long as the Render
  disk persists — the codebase's own comment (server.js:176-178) documents
  free-tier ephemerality, and an unchecked `docs/VPS_MIGRATION_CHECKLIST.md`
  exists. Until a persistent disk/VPS lands, `play_events` is best-effort
  capture: every redeploy can wipe the adjacency dataset. The spec's Purpose
  says "durable"; read it as "durable while the deployment is" — capture
  still ships now because it costs nothing extra later and is the only path
  to the data at all.
- JSON-fallback mode: endpoint returns 503-ish `{success:false}` — events
  are a nice-to-have, never worth breaking playback capture for; the client
  treats failure as "buffer and move on" (buffer flush discards on repeated
  503 to avoid stale-storm).

## D7 — Own `/api/log-error`, not Sentry

`client_errors` table: `id`, `user_id` (nullable — guests may report),
`message`, `stack` (truncated 4KB), `route`, `user_agent` (coarse),
`app_version`, `signature` (hash of message+first stack frame → dedup +
count), `count`, `first_seen`, `last_seen`. Dedup keeps the table small for
crash loops, but a flood of *distinct* signatures bypasses it — so the table
ALSO gets a hard row cap (~1k rows, oldest evicted on insert) in addition
to dedup.

- Endpoint: `POST /api/log-error` — unauthenticated but rate-limited per IP
  at a tighter ceiling than the default bucket (writes to disk; ~10/min/IP),
  payload size-capped, fields allowlisted server-
  side (client can't inject arbitrary keys), no tokens/lyrics/user text.
- Client: `ErrorBoundary` componentDidCatch + `window.onerror` +
  `unhandledrejection` → `navigator.sendBeacon` (survives page teardown)
  falling back to fetch. Fire-and-forget; failures swallowed.
- Inspect: `GET /api/admin/errors` behind `requireUser` + an `ADMIN_USER_IDS`
  env allowlist (household owner reads it; members can't), returning recent
  signatures by count. No UI this batch — curl/`sqlite3` is enough.

## D8 — What this batch deliberately does NOT do

- No Essentia/WASM (bandwidth+decode cost ≫ value; mood signal comes from
  editorial rails).
- No Last.fm (two-hop name-matching cascade; revisit only via a measured
  spike: top-100 playCounts → hit-rate + JioSaavn-resolution >60%).
- No co-play graph UI (data doesn't exist yet — that's exactly why D6 ships
  capture now).
- No local-file import (user decision: only works in dev mode).
- No playlist cover picker (folded: first-song art already powers previews
  and now the og card).

## Risks

- **Mood detail-endpoint shape unknown** — mitigated by D4's curated
  fallback; the spec only requires rails exist, not a specific upstream.
- **Share art proxy adds an upstream fetch on crawler paths** — crawlers
  re-fetch og:image rarely and we cache; bounded by art-cache TTL.
- **Smart shuffle metric is qualitative** — two weeks of family use, watch
  injected-song skip-rate vs baseline; if it's meaningfully worse, the
  feature defaults off anyway.
- **`/s/:code` needs the server routable** — on Vercel-style SPA hosts the
  path must reach the API origin; deployment config (rewrite/proxy) is a
  task, not an assumption.
