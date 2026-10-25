# Proposal

## Why

Adversarial review of the batch-4 scope decision found that two proposed items (Essentia.js audio analysis, Last.fm recommendations) solve problems this app doesn't have: the "Daily Mixes are just artist" complaint is a code defect (`DiscoverView` fills each mix from a single seed; the Weekly Mix generator in the same file already implements the correct multi-artist pattern), and the family's only social flow — shared playlist links — unfurls as a bare URL in WhatsApp because `/shared/:data` links are base64 payload URLs with no server-rendered metadata. Meanwhile, batch-2/3 machinery shipped without full verification, and its spec deltas were never archived to main specs, so `openspec/specs/` now drifts from shipped reality (`storage`, `family-activity`, `content-controls` missing). This change fixes the real defects, builds the share-link and error-visibility foundations, and starts capturing play-events data now — before the 200-entry history cap evicts the adjacency signal a household co-play graph will need later.

## What Changes

- **Verification gate first**: finish verifying batch-2/3 surface (crossfade overlap under normalize, playlist sort/drag, hide-flow, Weekly Mix generation, multi-device presence, cast on hardware where available), check off `tasks.md` boxes for what actually passes, and sync+archive batch-1/2/3 changes so main specs reflect shipped reality.
- **Server-rendered share links**: `POST /api/shares` stores a playlist payload and returns a short `/s/:code` URL; `GET /s/:code` returns server-rendered HTML with `og:title`/`og:description`/`og:image` so WhatsApp and other crawlers unfurl a real card. Existing `/shared/:data` links keep working as fallback/offline path.
- **Daily Mix multi-seed fix**: port the Weekly Mix seeding pattern (multiple distinct seed artists + per-artist cap on suggestion fill) to Daily Mixes so mixes are taste clusters, not single-artist echoes.
- **Mood rails**: Discover gains editorial mood/genre rails from the JioSaavn mirror endpoints (`/api/moods`, `/api/genres`) instead of a WASM audio-analysis pipeline — verified reachable upstream; detail-endpoint shape needs a probe during implementation.
- **Smart shuffle**: optional mode that injects suggestion songs into a shuffled queue via the existing `pickSuggestions` funnel (dedup + `isContentBlocked` + `capPerArtist`) plus a net-new skip-penalty filter (the funnel has no skipCounts handling today); toggleable, measurable against baseline shuffle skip-rate.
- **Play-events capture**: new SQLite `play_events` table (songId, userId, ts, sessionId) written at each qualifying play — the data a future household co-play graph needs; capture ships now, the graph UI deliberately does not.
- **Own error reporting**: `POST /api/log-error` stores client crashes/errors in SQLite (bounded, no-logs-posture-preserving — stays on our server, no Sentry dependency) with an ErrorBoundary/client hook reporting path.

Explicitly NOT in this batch (grill outcomes): Essentia.js, Last.fm, co-play graph UI, member local-file import, multi-select actions, playlist cover picker (folded into OG art — first-song art already derived).

## Capabilities

### New Capabilities
- `share-links`: server-stored playlist shares with short URLs and crawler-readable metadata.
- `play-events`: durable capture of per-member play events for future recommendation mining.
- `error-reporting`: server-side client-error log endpoint and client reporting path.

### Modified Capabilities
- `discovery`: Daily Mixes must seed from multiple distinct artists with per-artist fill caps; new mood/genre editorial rails.
- `playback`: smart-shuffle mode injects suggestion songs into shuffled queues through the existing suggestion funnel.
- `playlists`: share flow gains a server-side short-link path while preserving payload-URL fallback.
- `storage`: play-events and share-link records require new SQLite tables and retention rules — NOTE: `storage` spec exists only inside the batch-3 change (unarchived); archiving it is part of this change's gate, and this delta applies on top of that archived spec.

## Impact

- Backend (`src/server.js`, `src/store.js`): new `/api/shares`, `/s/:code`, `/api/log-error` routes; `play_events` + `shares` + `client_errors` SQLite tables; share HTML renderer with crawler-safe meta.
- Client (`client/src/`): `DiscoverView.jsx` mix seeding + mood rails; `App.jsx` smart-shuffle injection + queue plumbing; `ErrorBoundary.jsx` reporting; share flow switches to short links.
- No new paid services, no new runtime dependencies expected.
- Openspec housekeeping: batch-1/2/3 changes synced + archived as part of this change's verification gate.
