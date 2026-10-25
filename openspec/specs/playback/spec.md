# playback Specification

## Purpose

Defines the observable behaviors of the audio player: how the queue advances,
how shuffle and repeat modify that order, how stream quality adapts mid-song,
and how transitions between tracks are prepared.

## Requirements

### Requirement: Shuffle plays each queued song exactly once before repeating

When shuffle is enabled, the player SHALL establish a fixed randomized order
for the queue such that pressing Next plays every remaining song exactly once
before any song repeats. Toggling shuffle SHALL NOT interrupt or restart the
currently playing song.

#### Scenario: Shuffle through an album
- **WHEN** the user enables shuffle on a 10-song queue and presses Next repeatedly
- **THEN** all 10 songs play exactly once each in random order before any repeats

#### Scenario: Previous restarts after 3 seconds
- **WHEN** the user presses Previous with more than ~3s of the current song elapsed
- **THEN** the current song restarts from the beginning (regardless of shuffle)

#### Scenario: Previous in shuffle within 3 seconds
- **WHEN** shuffle is on and the user presses Previous within ~3s of track start
- **THEN** the song that played immediately before the current one starts, not a random pick

#### Scenario: Previous at permutation start
- **WHEN** shuffle is on, the user is at the first position of the shuffle order, and Previous is pressed within ~3s
- **THEN** the current song restarts (no wrap, no teleport to an unplayed song)

#### Scenario: New queue while shuffle is on
- **WHEN** shuffle is enabled and the user starts a different album/playlist/song
- **THEN** the shuffle order resets, anchored so the newly selected song is current

### Requirement: Repeat cycles through three states

The repeat control SHALL cycle `off → all → one → off`. In `all`, reaching the
end of the queue continues at the first song. In `one`, the ended song replays.
In `off`, playback stops at the end of the queue **unless autoplay is enabled,
in which case the queue is extended with similar songs and playback continues**.

#### Scenario: Repeat-all at queue end
- **WHEN** repeat is `all` and the last queued song ends
- **THEN** playback continues with the first queued song

#### Scenario: Repeat-one on song end
- **WHEN** repeat is `one` and a song ends
- **THEN** the same song restarts from the beginning without advancing the queue

#### Scenario: Repeat-off at queue end
- **WHEN** repeat is `off` and the last queued song ends
- **THEN** if autoplay is disabled or returns no songs, playback stops and shows a stopped state

#### Scenario: Repeat-off at queue end with autoplay
- **WHEN** repeat is `off`, autoplay is on, and the last queued song ends
- **THEN** similar songs are fetched and appended; playback continues into them

#### Scenario: Manual navigation under repeat-one
- **WHEN** repeat is `one` and the user presses Next or Previous manually
- **THEN** the queue advances/retreats normally (repeat-one affects only automatic end-of-track behavior)

### Requirement: Remote songs stream through the bitrate-parameterized endpoint

Remote (non-local) songs SHALL play via `/api/stream/:id?bitrate=N` so the
active bitrate reflects the actual stream. Local-library songs SHALL use
`/api/stream/:id` and SHALL NOT attempt bitrate switching (the endpoint
ignores `bitrate` for local files). Mid-song upgrades/downgrades SHALL swap
`audio.src` directly and restore position/play state — never `fetch()` the
stream body to obtain a URL.

#### Scenario: Buffer-healthy upgrade
- **WHEN** a remote song is playing at 96kbps with >15s of healthy buffer
- **THEN** the stream switches to a higher bitrate near-seamlessly, resuming within ~1s of the previous position

#### Scenario: Starving downgrade
- **WHEN** buffer ahead drops below ~1.5s at any bitrate above 96kbps on a remote song
- **THEN** the stream downgrades to 96kbps, preserving position

#### Scenario: Local song plays at full quality
- **WHEN** a local-library song plays
- **THEN** it streams at source quality with no bitrate switching attempts

#### Scenario: Bitrate tracking survives queue advance
- **WHEN** the queue advances to a remote song
- **THEN** that song is also eligible for adaptive bitrate switching (maxBitrate applies beyond the first-clicked song)

### Requirement: Next track's stream is warmed before the current song ends

While a song plays, the player SHALL identify the item that would actually
play next — respecting the current shuffle order and repeat mode — and warm
its stream URL (small range request) ahead of the transition so `ended`
handoff doesn't stall on server-side resolution.

#### Scenario: Queue transition
- **WHEN** a queued song is within ~15s of ending and a next song would play
- **THEN** the next song's stream endpoint has already been warmed when the transition occurs

#### Scenario: Prefetch follows actual play order
- **WHEN** shuffle is on (or repeat `one`/`all` changes what plays next)
- **THEN** the warmed track is the one that would actually play, not `queueIndex + 1`

#### Scenario: Prefetch failure tolerated
- **WHEN** warming the next track fails
- **THEN** the transition proceeds normally with no user-facing error

### Requirement: The queue is inspectable and manageable

The player SHALL provide a queue panel showing the upcoming items in play
order (respecting shuffle order when enabled), highlighting the current song.
Users SHALL be able to jump to an item, remove an item, reorder items, and
clear the queue.

#### Scenario: View the queue
- **WHEN** the user opens the queue panel while a queue is playing
- **THEN** upcoming songs are listed in actual play order with the current song marked

#### Scenario: Jump to an item
- **WHEN** the user taps a song in the queue panel
- **THEN** playback jumps to that song

#### Scenario: Remove and reorder
- **WHEN** the user removes a queued song or moves it up/down
- **THEN** the play order updates; removing the current song advances to the next item

#### Scenario: Queue edits preserve the shuffle no-repeats invariant
- **WHEN** songs are added, removed, or reordered while shuffle is on
- **THEN** already-played songs do not re-enter rotation before unplayed ones (the played prefix of the permutation survives)

#### Scenario: Clear the queue
- **WHEN** the user clears the queue while a song is playing
- **THEN** upcoming items are removed but the current song keeps playing

#### Scenario: Queue ops with nothing playing
- **WHEN** the user picks "Play next" or "Add to queue" on a song with no active queue
- **THEN** the song simply starts playing

### Requirement: Song rows expose a context menu

Song rows across the app SHALL offer a `...` menu with actions appropriate to
the song: Play next, Add to queue, Add to playlist, Go to song radio,
Like/Unlike, Go to album, View lyrics, and Share.

#### Scenario: Play next
- **WHEN** the user picks "Play next" on a song
- **THEN** it is inserted immediately after the current position in play order

#### Scenario: Add to queue
- **WHEN** the user picks "Add to queue"
- **THEN** the song is appended to the queue without interrupting playback

#### Scenario: Add to playlist
- **WHEN** the user picks "Add to playlist" and selects a playlist
- **THEN** the song is stored in that playlist

#### Scenario: Queue rows tolerate duplicates
- **WHEN** the same song is added to the queue twice
- **THEN** both entries display and play independently (rows keyed by position, not song id)

#### Scenario: Go to album
- **WHEN** the user picks "Go to album" and the song has album metadata
- **THEN** the app navigates to that album; the item is disabled when album info is absent

#### Scenario: View lyrics
- **WHEN** the user picks "View lyrics"
- **THEN** the lyrics panel opens for that song

#### Scenario: Share a song
- **WHEN** the user picks "Share"
- **THEN** the share sheet opens (or the deep link copies to clipboard) and a toast confirms

### Requirement: Contexts offer Play and Shuffle-Play buttons

Album, playlist, artist, and liked-songs views SHALL show primary Play and
Shuffle buttons that start playback of the whole context.

#### Scenario: Play a context
- **WHEN** the user taps Play on an album/playlist/artist header
- **THEN** playback starts at the first song with the context as the queue

#### Scenario: Shuffle a context
- **WHEN** the user taps Shuffle on a context header
- **THEN** playback starts on a random song with shuffle enabled

### Requirement: Autoplay extends an exhausted queue with similar songs

When the queue ends (repeat `off`, autoplay enabled), the app SHALL fetch
songs similar to the last-played song via `/api/songs/:id/suggestions`,
exclude items already in the queue or recently played, append up to ~20, and
continue playback. A toast SHALL indicate "Playing similar songs" once per
session-extension. Suggestion failures SHALL degrade to a normal stop —
never error or loop.

#### Scenario: Seamless continuation
- **WHEN** the last queued song ends with autoplay on
- **THEN** similar songs are appended and the next one starts without user action

#### Scenario: No duplicates in extension
- **WHEN** suggestions include songs already in the queue
- **THEN** they are filtered out before appending

#### Scenario: Autoplay toggle
- **WHEN** the user disables autoplay in settings
- **THEN** the preference persists and queues end with a normal stop

#### Scenario: Suggestions unavailable
- **WHEN** the suggestions endpoint fails or returns nothing usable
- **THEN** playback stops normally with no error shown

#### Scenario: Extension chains until disabled or exhausted
- **WHEN** an autoplay-extended queue exhausts again with autoplay still on
- **THEN** extension re-triggers, seeded on the last-played song (the chain continues)

#### Scenario: Toggled off mid-extension
- **WHEN** the user disables autoplay after an extension was appended
- **THEN** already-appended songs play out normally; no further extension occurs

#### Scenario: Extension under shuffle
- **WHEN** a queue exhausts while shuffle is on
- **THEN** appended songs enter at the end of the shuffle order and are reachable

### Requirement: Song and artist radio

The app SHALL offer "Go to song radio" on track menus (plays the seed song
then a queue built from its suggestions) and a "Radio" action on artist pages
(a shuffled mix of the artist's top songs blended with seeded suggestions).

#### Scenario: Song radio
- **WHEN** the user picks "Go to song radio" on a track
- **THEN** the song plays with a queue of similar songs following it

#### Scenario: Artist radio
- **WHEN** the user taps Radio on an artist page
- **THEN** a varied queue of that artist's songs plus similar-song seeds starts shuffled

#### Scenario: Radio seeding fails
- **WHEN** suggestions can't be fetched for a radio seed
- **THEN** song radio falls back to a single-song queue; artist radio falls back to the artist's own catalog

### Requirement: Swipe actions on mobile song rows
Touch devices MUST support swipe-left → add to queue and swipe-right → like on song rows, with visual feedback during the gesture and no interference with vertical scrolling. Rows MUST set `touch-action: pan-y` so the browser does not cancel the gesture mid-swipe.

#### Scenario: Swipe left adds to queue
- **WHEN** the user swipes a song row horizontally left on a touch device
- **THEN** the song is added to the play queue and a confirmation shows

#### Scenario: Swipe right toggles like
- **WHEN** the user swipes a song row horizontally right on a touch device and is signed in
- **THEN** the song's like state toggles; if signed out the sign-in flow opens instead

#### Scenario: Vertical scroll unaffected
- **WHEN** the user drags vertically on a song row
- **THEN** the list scrolls normally and no swipe action triggers

#### Scenario: Non-touch devices unaffected
- **WHEN** the app runs on a non-touch device
- **THEN** no swipe affordances render and pointer behavior is unchanged

### Requirement: Crossfade duration selector (new UI)
"Smooth transitions" is a boolean toggle today. This change SHALL replace it with a duration selector offering off / 1s / 3s / 5s / 10s — same compact chip-popover pattern as the sleep timer. An existing `'on'` value migrates to `3s`; `'off'` stays off. Any duration enables true crossfade.

#### Scenario: Selector replaces toggle
- **WHEN** a member opens Settings
- **THEN** "Smooth transitions" shows a duration chip (e.g. "5s") that opens a preset popover, not a boolean toggle

### Requirement: True crossfade on natural queue advance
When a crossfade duration is set and the queue has a next song, the player SHALL overlap the outgoing track's fade-out with the incoming track's fade-in using a second audio element, starting the incoming track `crossfadeSeconds` before the outgoing ends. At no point SHALL both elements be silent. Manual interactions (skip, queue replace, selecting a different song, repeat-one replay) use the EXISTING hard-cut/fade path — crossfade applies only to the natural queue-advance path until proven stable.

#### Scenario: Natural track end with 5s crossfade
- **WHEN** crossfade is set to 5s and a song approaches its end with a next song queued
- **THEN** the next song starts ~5s early, volumes cross linearly, and no silence gap is audible

#### Scenario: Repeat-one does not crossfade
- **WHEN** repeat mode is "one" and a song ends
- **THEN** the same song replays on the primary element — no secondary element is started (there is no next queue index)

#### Scenario: Manual skip uses the existing path
- **WHEN** a member taps Next during playback (including mid-crossfade)
- **THEN** the current hard-cut/fade behavior applies and any in-flight crossfade is aborted (secondary element paused + released)

### Requirement: Crossfade element discipline
ALL playback mutations (seek, pause/resume, bitrate switch, sleep-timer stop/end-of-track, visibility-resume, volume, queue-replace, queue-remove) MUST operate on the element currently audible. At crossfade commit, the outgoing element's `ended`/`timeupdate`/`error` handlers MUST be detached before the roles swap, so it cannot double-advance the queue or fire sleep-EOT. The existing 500ms fade-in on `playing` MUST be suppressed on the secondary element (its volume is driven by the crossfade loop). The incoming element streams at the bitrate current at prefetch time; a mid-crossfade bitrate change applies to the audible element only.

#### Scenario: Pause mid-crossfade
- **WHEN** a member pauses while both elements are playing
- **THEN** both pause; resume resumes whichever element is live at that moment — never both

#### Scenario: Sleep timer end-of-track mid-crossfade
- **WHEN** sleep-EOT is armed and the outgoing song's `ended` would fire after commit
- **THEN** it does NOT double-fire or cut the incoming track — EOT resolves against the audible element's end

#### Scenario: Bitrate switch mid-crossfade
- **WHEN** a member changes quality while a crossfade is in flight
- **THEN** the currently audible element switches per existing logic; the prefetch already in flight completes at its original bitrate (no mid-flight restart)

#### Scenario: Secondary element failure falls back
- **WHEN** the secondary element fails to load or play (network, stream 404)
- **THEN** the transition completes via the existing hard-cut path — the song still advances, no stuck silence

### Requirement: Secondary-element handler ownership
Listeners are attached per-element at role assignment. The SECONDARY element MUST NOT write `playHistory`/`playCounts` (no phantom plays on abort), MUST NOT drive progress UI, MediaSession position state, adaptive-bitrate logic, or the warm probe — those stay keyed to the element currently audible. The secondary's own `ended`/`timeupdate` are inert; commit comes only from the outgoing element's end/fade-done. Only after role swap do history/count writes follow the new current element.

#### Scenario: No phantom plays on abort
- **WHEN** a crossfade starts and the member manually skips before commit
- **THEN** the incoming song records NO playCounts/playHistory entry — its `playing` event fired on the secondary, which is inert

#### Scenario: Progress stays on the audible track
- **WHEN** a crossfade is in flight
- **THEN** the progress bar and lock-screen position track the outgoing (audible) element until commit, then the incoming

### Requirement: Data-saver mode
Settings SHALL include a "Data saver" toggle (persisted, synced for members, device-local for guests). When ON, the app MUST cap `maxBitrate` at 96 (the same mechanism the existing "Low Data" quality option uses — capping `maxBitrate`, not rewriting the stream URL — so the adaptive upgrade effect cannot climb back to 160/320), and MUST skip the low-impact "warm" Range probe used to smooth track boundaries. The quality control SHALL show an overridden state while data-saver is on; enabling it when quality is already "Low Data" is idempotent. When OFF, prior behavior resumes.

#### Scenario: Data saver pins quality
- **WHEN** a member enables data saver with quality set to 320kbps
- **THEN** streams cap at 96kbps AND the adaptive buffer-health upgrade cannot exceed it, until data saver is disabled

#### Scenario: Idempotent with Low Data
- **WHEN** quality is already "Low Data" (96k) and the member enables data saver
- **THEN** nothing changes in stream quality (only the warm probe stops)

#### Scenario: Guests get device-local behavior
- **WHEN** a guest enables data saver
- **THEN** it applies to that device's playback only and never writes to a member sync doc

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
