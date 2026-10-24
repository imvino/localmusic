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
