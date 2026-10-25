# Spec Delta — share-links (new capability)

## Purpose
Server-stored playlist shares with short URLs and crawler-readable page
metadata, so shared playlists unfurl as titled cards in chat apps instead of
bare multi-kilobyte URLs.

## ADDED Requirements

### Requirement: Playlist shares stored server-side with short codes
A signed-in member sharing a playlist SHALL cause the client to POST the
share payload (playlist name + slimmed song list, same shape the existing
`/shared/:data` encoder produces) to `POST /api/shares`. The server MUST
persist the payload keyed by a short opaque code and return the code. The
client MUST prefer the resulting `/s/:code` URL for the share action.

#### Scenario: Share produces a short URL
- **WHEN** a member taps Share on a playlist
- **THEN** the copied link is `https://<host>/s/<code>` of bounded length
  regardless of playlist size (up to the existing 100-song cap)

#### Scenario: Payload limits enforced
- **WHEN** a share payload exceeds the documented size cap (~40KB — sized to
  fit a full 100-song encoded playlist, which measures ~26KB) or is
  malformed
- **THEN** the request is rejected with a client-readable error and nothing
  is persisted

#### Scenario: Guests cannot create shares
- **WHEN** an unauthenticated client POSTs to `/api/shares`
- **THEN** the request is rejected (sharing is a member feature)

#### Scenario: A leaked share can be killed
- **WHEN** the owning member requests revocation (`DELETE /api/shares/:code`,
  owner-only)
- **THEN** the row is removed and `/s/:code` returns not-found thereafter

### Requirement: Share page renders crawler-readable metadata
`GET /s/:code` MUST return 200 server-rendered HTML containing `og:title`,
`og:description`, and `og:image` absolute-URL meta tags in `<head>` —
crawlers read head-only and never execute JavaScript. The same response MUST
hand human visitors into the app's shared-playlist preview: a `<noscript>`
preview/fallback for no-JS contexts plus a script redirect into the SPA's
existing `/shared/:data` flow (the payload is embedded in the page). All
user-derived strings in the rendered HTML MUST be escaped. A bare-302
redirect MUST NOT be used (crawlers do not reliably re-scrape redirect
hops).

#### Scenario: WhatsApp unfurls a card
- **WHEN** a chat crawler fetches `/s/:code` with no JS execution
- **THEN** the response contains og:title with the playlist name, an
  og:description composed as "N songs · shared by <owner display name or
  'a member'> · Torsongs" (owner name snapshotted at share-creation time
  from the member's stored profile), and an absolute-URL og:image that is
  actually fetchable over HTTPS

#### Scenario: Recipient opens the link
- **WHEN** a family member opens `/s/:code` in a browser
- **THEN** they reach the playlist preview (same import/play affordances as
  the existing shared-playlist view) without needing to sign in

#### Scenario: No-JS recipient still gets something
- **WHEN** a human opens `/s/:code` with JavaScript disabled
- **THEN** the `<noscript>` content renders the playlist name, song count,
  and share context as readable HTML — never a blank page (a rich preview
  requires the SPA, which needs JS)

#### Scenario: Unknown code
- **WHEN** `/s/:code` is requested for an expired or never-existing code
- **THEN** a graceful not-found page is returned (no crash, no bare 500)

### Requirement: The art proxy cannot become an SSRF oracle
The `/s/:code/art` proxy is public and fetches a client-influenced URL, so
egress MUST be restricted at both boundaries with a three-way write-time
rule applied to the first song's `m` field (the only URL the proxy will
ever fetch):
- `m` empty, absent, or relative (the encoder emits both legitimately) →
  **accept**; the share uses the generated default card.
- `m` absolute → MUST parse via a URL parser (never substring matching),
  scheme MUST be `https`, and the parsed host MUST equal or be a subdomain
  of `saavncdn.com` or `gaanacdn.com` — else the POST is rejected.
- The proxy independently re-enforces https-only, no redirect-following,
  a response size cap, and a per-IP rate limit on cache misses.

#### Scenario: Evil image URL is refused
- **WHEN** a share payload carries `m: "http://169.254.169.254/x"`, a
  userinfo smuggle like `https://saavncdn.com@evil.io/x`, or a lookalike
  host like `https://evilsaavncdn.com/x`
- **THEN** the POST is rejected; a stored share can never aim the proxy at
  internal or attacker hosts

#### Scenario: Imageless playlist still shares
- **WHEN** the first song's `m` is empty or relative (e.g. the encoder's
  `/logo_512x512.png`)
- **THEN** the share is accepted and `/s/:code/art` serves the branded
  default card — the short link never degrades for lack of art

#### Scenario: Proxy fetches safely
- **WHEN** `/s/:code/art` serves an allowlisted image
- **THEN** it issues exactly one https request (no redirect chase), caps the
  response size, and rate-limits repeated misses per IP

### Requirement: og:image never depends on unreliable third-party hotlinks
The og:image URL MUST be served from the app's own origin or a generated
default — playlist art derived from song images MUST be proxied or rendered
by the server rather than linked to external CDN URLs that have historically
broken link previews.

#### Scenario: Song art becomes card art
- **WHEN** a shared playlist has album art
- **THEN** og:image resolves to an app-origin image endpoint that returns
  valid image bytes to a crawler

#### Scenario: No art available
- **WHEN** the playlist has no usable art
- **THEN** og:image falls back to a branded default card, never a broken URL

### Requirement: Legacy payload links keep working
Existing `/shared/:data` links MUST continue to decode and render. If the
share server call fails (offline, server down), the client MUST fall back to
producing a payload link rather than failing to share.

#### Scenario: Offline share degrades gracefully
- **WHEN** the POST to `/api/shares` fails
- **THEN** the client still produces a working `/shared/:data` link

#### Scenario: Old links still import
- **WHEN** a previously copied `/shared/:data` link is opened
- **THEN** the playlist preview imports and plays as before

### Requirement: Shares are bounded and expirable
Stored shares MUST have a retention policy (TTL or bounded table) so the
share table cannot grow without limit. Share codes MUST be unguessable
(adequate entropy — not sequential ids).

#### Scenario: Old shares expire
- **WHEN** a share passes its retention window
- **THEN** `/s/:code` returns the graceful not-found page
