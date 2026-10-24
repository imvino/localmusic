# Spec Delta

## Purpose

Defines how the app remembers what was played (recently-played history) and
how it restores an interrupted playback session across page reloads.

## ADDED Requirements

### Requirement: Plays are recorded to local history

Each time a song successfully starts playing (stream resolved and playback
begun — not merely selected), the app SHALL append an entry containing the
song identity, album/artist metadata, and timestamp to a locally persisted
play-history list, capped at a reasonable size (e.g. 200 entries),
deduplicating consecutive repeats of the same song.

#### Scenario: Playing a song records it
- **WHEN** the user plays a song
- **THEN** an entry appears in play history with title, artist, album, artwork, and timestamp

#### Scenario: History survives reload
- **WHEN** the user reloads the page after playing songs
- **THEN** the play history is unchanged and still visible

### Requirement: Recently Played is surfaced on Discover

The Discover view SHALL render a "Recently Played" row listing the most recent
unique songs from history, and tapping an item SHALL play it.

#### Scenario: Row reflects history
- **WHEN** the user has played songs and opens Discover
- **THEN** Recently Played shows the most recent songs, newest first, playable on tap

#### Scenario: Empty history hides the row
- **WHEN** play history is empty
- **THEN** the Recently Played row is not rendered

### Requirement: Playback session is restorable after reload

The app SHALL persist the queue, queue position, current song, playback
position, and shuffle/repeat state while playing. On reload, if a persisted
session exists, the app SHALL offer to resume. Resumed songs SHALL have their
stream URLs rebuilt fresh (deterministic endpoint or re-resolved) — persisted
CDN URLs MUST NOT be trusted — and the saved position SHALL restore only after
the stream's metadata has loaded.

#### Scenario: Resume after reload
- **WHEN** the user reloads mid-song and accepts the resume prompt
- **THEN** the same song resumes from the saved position with the queue intact

#### Scenario: Resume into expired upstream URL
- **WHEN** the persisted session's upstream CDN URL has expired
- **THEN** resume still succeeds by rebuilding/re-resolving the stream URL

#### Scenario: Stale or cleared session
- **WHEN** the persisted session is older than 24h or the user dismisses it
- **THEN** it is discarded and the app starts fresh
