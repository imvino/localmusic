# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
