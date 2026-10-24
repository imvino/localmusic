# Spec Delta

## Purpose

Defines the observable behaviors of the audio player: how the queue advances,
how shuffle and repeat modify that order, how stream quality adapts mid-song,
and how transitions between tracks are prepared.

## ADDED Requirements

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
In `off`, playback stops at the end of the queue.

#### Scenario: Repeat-all at queue end
- **WHEN** repeat is `all` and the last queued song ends
- **THEN** playback continues with the first queued song

#### Scenario: Repeat-one on song end
- **WHEN** repeat is `one` and a song ends
- **THEN** the same song restarts from the beginning without advancing the queue

#### Scenario: Repeat-off at queue end
- **WHEN** repeat is `off` and the last queued song ends
- **THEN** playback stops and the player shows a stopped state

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
