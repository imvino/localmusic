# Spec Delta — playback (modified)

## ADDED Requirements

### Requirement: Chromecast sender
The app SHALL load the Google Cast CAF sender framework lazily and show a
cast button in the player bar and full-screen player when a cast-capable
device is advertised. On cast, the RECEIVER (not the phone) SHALL play the
current song by fetching a LAN-reachable `/api/stream/:id` URL — the audio
element pauses but the queue/session stays local.

Cast URL resolution:
- Step 0: `base = API_BASE || window.location.origin` — `VITE_API_URL` is
  unset in default dev so URLs are relative; resolve against the page
  origin first.
- If `base`'s hostname is a public host or a private-LAN IP → use it as-is.
- If `base` is `localhost`/`127.0.0.1` → resolve the server's LAN origin
  via `GET /api/lan` (auth-required, see below) and build
  `${lanOrigin}/api/stream/${id}?bitrate=160`.
- If no LAN-reachable origin can be determined → the cast button MUST be
  hidden rather than fail silently.

Local files (`isLocal`) CAN cast through the same `/api/stream/:id` URL
when the server serves them — there is no local-file restriction.

While the app stays open it acts as the cast session's controller: when the
receiver reports a song finished (`idleReason: FINISHED`), the client SHALL
record the play stat (same threshold rules as local playback — a finished
song counts), advance the queue pointer, and `loadMedia` the next queued
song. Cast sessions therefore play through a queue, not one song at a time.

Cast state changes MUST reflect in the player UI (casting indicator,
disconnect). Guests MAY cast (no account needed).

#### Scenario: Cast on the home network
- **WHEN** a Chromecast is on the LAN and the member taps cast then picks the device
- **THEN** the TV/speaker starts playing the current song within a few
  seconds and the phone shows a casting indicator

#### Scenario: No LAN-reachable API
- **WHEN** the client cannot determine a LAN-reachable origin for the API
- **THEN** no cast button is rendered (never a broken button)

#### Scenario: Disconnect returns control
- **WHEN** the member disconnects from the cast device
- **THEN** local playback resumes/pauses per existing state; the queue and
  position are intact

#### Scenario: Song finishes while casting
- **WHEN** the receiver reports the current media finished and a next song
  is queued
- **THEN** the finished play counts (if not already counted) and the
  receiver loads the next queued song

### Requirement: /api/lan is a dev-only authenticated endpoint
`GET /api/lan` SHALL require a Clerk session (`requireUser`), apply the
existing `rateLimited` bucket, and MUST return `origin` only when the
request's `Host` header indicates a local origin (localhost/127.0.0.1 or a
private IPv4). On a public deployment it returns `{origin:null}` — the
client then hides the cast button rather than casting a dead URL.

#### Scenario: Production deployment
- **WHEN** `/api/lan` is hit on a public host
- **THEN** it returns `{origin:null}` and the client never consults it again

### Requirement: Loudness normalization
When enabled (Settings → "Normalize volume", default ON for members,
device-local for guests), the player SHALL measure the loudness of the
currently audible element's decoded signal over a rolling window (~15s) and
apply a compensating per-element `GainNode` so tracks play at a similar
perceived loudness.

- The measurement MUST run through per-element WebAudio nodes (a real
  `Map<element,{source,normGain,analyser}>` registry in `eq.js` — the
  current single-source/attachedElement variables do not suffice) — no
  second decode or fetch.
- The graph MUST be built lazily at the first play gesture when
  `eqEnabled || normalizeVolume` — NEVER eagerly at mount for the
  normalize-only case (media-session/lock-screen resume is not a gesture;
  an early build leaves a suspended context → silence). The incoming
  crossfade element MUST enter the registry before it plays, so a
  normalize-on/EQ-off session stays normalized across the swap. The
  AudioContext MUST be resumed on every play path while either feature is
  on.
- Gain changes MUST be ramped (≥200ms) so drift is inaudible and clamped to
  ±12dB so a quiet master never blasts.
- Once an element enters a fade (crossfade start), its measurement MUST
  freeze — a volume-ramping element must not be re-boosted mid-fade.
- Each element keeps its own measured gain — a mid-fade song doesn't jump.
- Disabling normalization flattens `normGain` to 1; it MUST NOT disconnect
  a captured source (detaching a `MediaElementSource` silences the element).
- If the AudioContext cannot be created/resumed, normalization is silently
  off and playback volume is unchanged.

#### Scenario: Quiet song after loud song
- **WHEN** normalization is on and a quiet-mastered track follows a loud one
- **THEN** the quiet track's gain rises gradually over its first seconds and
  perceived loudness matches within ~15s — no audible step

#### Scenario: Default config is never silent
- **WHEN** a fresh user (normalize ON, EQ OFF) presses play
- **THEN** the graph builds + resumes on that gesture and audio is audible —
  a suspended context never gates playback

#### Scenario: Crossfade during normalization
- **WHEN** a crossfade is in flight with normalization on
- **THEN** the outgoing element's gain is frozen at fade-start (no +12dB
  pump as its volume ramps down) and the incoming keeps its own gain

### Requirement: Local-file streams are capturable by the audio graph
The local-file branch of `/api/stream` SHALL send
`Access-Control-Allow-Origin: *` like the proxied-stream path already does,
so `crossOrigin="anonymous"` audio elements capture local audio instead of
outputting silence. (`/music/` static serving already sits behind the
global cors middleware — no change needed there.)

#### Scenario: Local file with normalization on
- **WHEN** a local (MUSIC_DIR) song plays with the audio graph active
- **THEN** it is audible — its response carries ACAO and MediaElementSource
  capture succeeds

### Requirement: Settings persistence for normalization
`normalizeVolume` (boolean) SHALL persist like other playback prefs: member
key under sync, guest key device-local, included in
`pushSnapshot`/pull-merge and `personalData` wipe lists per the batch-2
key-scoping rules. Cast availability is runtime discovery state — it is NOT
persisted or synced.

#### Scenario: Preference survives restart
- **WHEN** a member disables Normalize volume and reloads
- **THEN** it stays disabled and (for members) syncs to their other devices
