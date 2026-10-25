# Spec Delta — family-activity (modified)

## ADDED Requirements

### Requirement: Live presence over WebSocket
The server SHALL host a WebSocket endpoint at `/ws/presence` using the `ws`
package. Clients authenticate by sending their Clerk session token as the
first message `{type:'auth', token}`; the server verifies it via
`clerkClient.verifyToken`, exactly like `requireUser`. Unauthenticated or
invalid-token connections MUST be closed with a policy close code. One HTTP
server SHALL host both Express and the `ws` server (no second port).

#### Scenario: Authenticated member connects
- **WHEN** a signed-in member opens a presence socket and sends a valid token
- **THEN** the server acks `{type:'auth:ok'}` and keeps the socket

#### Scenario: Guest or bad token is rejected
- **WHEN** a client connects without a token or with an invalid one
- **THEN** the socket is closed before any presence data is shared; no
  presence frame for that client is ever broadcast

### Requirement: Heartbeat keeps presence alive for long tracks
While a song is playing the client MUST re-send `{type:'now'}` at least every
60s (a heartbeat — not only on song start). The server sweep threshold
MUST exceed this interval (≥90s) so a mid-song member is never dropped
mid-track. The server SHALL also enforce a minimum 5s gap between accepted
`now` frames per connection — except frames carrying a DIFFERENT song id,
which bypass the throttle (a rapid skip must update presence immediately).
Client-side throttling alone is not trusted. Entry timestamps are stamped
server-side at receipt — client clocks are never trusted for sweep/dedupe.
Broadcasts SHOULD be sent only when the deduplicated member view changed —
a heartbeat that changes nothing re-broadcasts nothing.

#### Scenario: Member stays visible through a 4-minute song
- **WHEN** a member plays a 240s track without pausing
- **THEN** they remain in "Listening now" for the whole track — heartbeat
  frames keep their entry fresh under the sweep threshold

### Requirement: Per-connection presence identity
Presence SHALL be keyed per-connection (`userId + connectionId`), not
per-user. Broadcasts deduplicate to one entry per user — the entry with the
newest timestamp wins. A connection close or `idle` frame removes only that
connection's entry; a member disappears only when their LAST connection
goes idle/away. A second tab or device of the same member MUST NOT evict
the first's presence.

#### Scenario: Two devices, one closes
- **WHEN** a member has the app open on phone (playing) and laptop (idle tab)
  and the laptop socket closes or sends `idle`
- **THEN** the member stays in "Listening now" — the phone's still-playing
  connection keeps their entry alive

### Requirement: Now-playing broadcast gated on shareActivity AND privacy
A connected member SHALL publish `{type:'now', song:{id,name,artist,image}}`
when a song starts and `{type:'idle'}` when playback stops or pauses >60s.
Two independent gates apply before relaying:
- **shareActivity**: the server MUST only relay `now` frames for members
  whose stored library doc has `shareActivity===true` — opt-in is
  authoritative server-side; a crafted client cannot self-promote.
- **Private session**: the client MUST NOT send `now`/`heartbeat` frames
  while private session is on (mirrors `recordPlayStats`'s "record nothing"
  contract). If private session turns on mid-track, the client sends `idle`
  so their entry disappears immediately.
- **shareActivity toggled off** mid-session also triggers `idle` — the entry
  must not linger until the sweep.
- **No Clerk key** (dev without auth configured): the client skips presence
  entirely — `isSignedIn` can be true with a null token there.

Each broadcast MUST include the member's `displayName` (cached from their
doc, falling back to the Clerk profile name like `/api/family/activity`).

#### Scenario: Opted-in member starts a song
- **WHEN** a member with shareActivity on starts a track
- **THEN** other connected members receive `{type:'presence', members:[...]}`
  showing them with the current song within ~1s

#### Scenario: Opted-out member stays invisible
- **WHEN** a member with shareActivity off starts a track (even if their
  client sends `now`)
- **THEN** no presence frame about them is broadcast to anyone

#### Scenario: Private session mid-track
- **WHEN** a listening member toggles private session on
- **THEN** the client sends `idle`, the member leaves "Listening now", and
  no further now-playing is shared until private session ends

### Requirement: Discover "Listening now" surface
The client SHALL connect to `/ws/presence` after sign-in when
`shareActivity` is on, publish its own now-playing, and render a
"Listening now" row on Discover showing other opted-in members' live
activity (member name + song + artist). Stale presence (>90s without a
heartbeat/frame) MUST be dropped client-side and server-side. When offline
or signed out, the row MUST NOT render an empty shell — it disappears.

#### Scenario: Household member is live
- **WHEN** another household member is playing music with sharing on
- **THEN** Discover shows "Arun is listening — Kaavaalaa · Anirudh" live

#### Scenario: Member goes quiet
- **WHEN** a member pauses/stops for over 60s or closes the app
- **THEN** their entry disappears from "Listening now" without manual refresh

### Requirement: Resilience
The client MUST reconnect with backoff (1s→30s cap) on unexpected socket
close, and MUST NOT block or degrade any existing behavior when the socket
is unavailable (presence is pure enhancement). Server restarts drop all
presence state — nothing is persisted — and clients MUST re-announce their
now-playing on reconnect.

#### Scenario: Server restarts mid-session
- **WHEN** the server bounces while members are connected
- **THEN** clients reconnect automatically and "Listening now" repopulates
  on the next now-playing announcement or reconnect re-announce
