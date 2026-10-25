# family-activity Specification

## Purpose
A friends-and-family social layer: let household members who opt in see each other's recent plays — the one "social" feature this architecture genuinely supports.

## Requirements

### Requirement: Activity sharing opt-in
Settings SHALL include "Share my listening activity" (default OFF). A member's recent plays MUST NOT be visible to anyone while OFF. The flag lives in the member's synced library doc with a timestamp (`shareActivity` + `shareActivityAt`). BOTH the server PUT merge AND the client pull merge MUST resolve the flag by comparing `shareActivityAt` (newest write wins) — a plain overwrite lets a stale device's push re-enable sharing after an opt-out. The server PUT whitelist MUST be extended to persist `shareActivity`, `shareActivityAt`, and `displayName` (unknown fields are currently dropped silently).

#### Scenario: Default is private
- **WHEN** a member has never toggled the setting
- **THEN** their activity does not appear in any other member's feed

#### Scenario: Stale device cannot re-enable
- **WHEN** a member opts out on device A while device B holds a stale doc with sharing on, and B pushes before pulling
- **THEN** the timestamped flag resolves to the newest write — the opt-out wins

### Requirement: Family activity endpoint
`GET /api/family/activity` (authenticated) SHALL scan the per-user library docs and return, per opted-in member, their recent plays: `{memberName, song, artist, image, ts}` rows merge-sorted newest-first, capped at 50 total. The requester's own doc MUST be excluded — the feed shows only OTHER members' activity (a "family" feed of one's own rows is noise). Members who have not opted in MUST NOT appear, including partial/leaked fields. `memberName` resolves from the doc's `displayName`; when absent, the server SHALL look it up via `clerkClient.users.getUser(userId)` (secret key already configured) using first name, falling back to "Member" — and cache the resolved name back into the doc. The endpoint reads N user docs per request (the store loads one doc per request today — this is new, and acceptable at household scale).

#### Scenario: Only opted-in members appear
- **WHEN** two members exist, one opted in and one not, and a third member requests the feed
- **THEN** only the opted-in member's entries are returned

#### Scenario: Unauthenticated request
- **WHEN** a guest requests `/api/family/activity`
- **THEN** the server responds 401 (consistent with other member endpoints)

#### Scenario: Name resolves for pre-existing docs
- **WHEN** a member opted in before `displayName` persistence existed
- **THEN** the feed still renders their real name via the Clerk lookup fallback

#### Scenario: Entry shape
- **WHEN** the feed returns entries
- **THEN** each carries memberName, song name, artist, image, and ts — enough to render "Appa played X" without a second lookup

### Requirement: Activity feed surface
Signed-in members SHALL see a "Family activity" section on Discover's member area when at least one *other* member has opted in and has entries. Tapping an entry plays or navigates to that song. The member's own entries MUST NOT appear — when the requester is the only opted-in member, the rail does not render. When nobody shares, the surface shows an empty-state nudge to enable sharing rather than disappearing silently (visible only to members who would benefit).

#### Scenario: Feed renders for member
- **WHEN** a signed-in member opens Discover and another member has opted in with plays
- **THEN** rows render "MemberName played Song — Artist" newest first

#### Scenario: Nobody shares
- **WHEN** no member has opted in
- **THEN** members see an empty-state prompt to enable sharing; guests see nothing

#### Scenario: Guests see nothing
- **WHEN** a guest browses Discover
- **THEN** no family-activity surface renders and no request fires

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
