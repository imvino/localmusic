# offline

## Purpose

Defines offline resilience: audio already fetched by the player keeps
playing with no network, including seeks within cached songs.

## Requirements

### Requirement: Streamed audio is cached by the service worker

The service worker SHALL route `/api/stream/` requests (any origin,
dev same-origin and prod Render API alike) CacheFirst; the URL pattern
SHALL match cross-origin hrefs from index 0 (`/^https?:\/\/[^/]+\/api\/stream\//`)
because Workbox RegExp routes require cross-origin matches at the href
start. Because the
`<audio>` element always sends `Range` and the server answers `206` —
which the Cache API cannot store — the route SHALL include a plugin that
strips the `Range` header on cache-miss so the full `200` response is what
lands in cache; `rangeRequests` SHALL slice that cached body for seeks.
Cache SHALL be bounded (100 entries / 30 days / `purgeOnQuotaError`).
Cached entries are keyed by full URL — one entry per bitrate level of the
same song is acceptable.

#### Scenario: Replay a heard song offline
- **WHEN** the network is down and the user replays a previously-streamed
  song at the same URL (id + bitrate)
- **THEN** it plays from cache without a network request

#### Scenario: Seek within a cached song
- **WHEN** the user seeks inside a cached song
- **THEN** the range request is served from the cached full response

#### Scenario: Cache eviction
- **WHEN** more than 100 entries are cached or quota pressure occurs
- **THEN** the oldest entries are evicted automatically

#### Scenario: Non-proxied stream URLs are out of scope
- **WHEN** a song plays from a non-`/api/stream/` URL (e.g. raw saavncdn
  downloadUrl)
- **THEN** it is neither cached nor EQ-processed — proxied URLs only

### Requirement: Offline status banner
The app MUST display a persistent but unobtrusive banner whenever connectivity is lost — detected via `navigator.onLine`/online-offline events AND the existing periodic server health check (the health check is the backstop where browser online events are unreliable, e.g. iOS standalone PWA). The banner MUST distinguish "no internet" from "server unreachable".

#### Scenario: Going offline shows banner
- **WHEN** the browser reports offline or the health check fails while online status is ambiguous
- **THEN** an offline indicator is visible app-wide

#### Scenario: Reconnect hides banner
- **WHEN** connectivity is restored (online event or health check recovers)
- **THEN** the banner disappears

### Requirement: Downloads storage meter
The Downloads view MUST show total storage used by downloaded audio and available device storage when the platform exposes storage estimates.

#### Scenario: Storage usage displayed
- **WHEN** a signed-in user opens Downloads and the browser supports storage estimates
- **THEN** a meter shows bytes used by the downloads cache and overall quota usage

#### Scenario: Estimate unavailable degrades
- **WHEN** storage estimates are unavailable (e.g. older Safari)
- **THEN** the view shows downloaded item count without the meter, no error
