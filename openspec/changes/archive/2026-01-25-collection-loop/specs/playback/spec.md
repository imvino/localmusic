# Spec Delta

## ADDED Requirements

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
the song: Play next, Add to queue, Add to playlist, Like/Unlike, and Go to
album.

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

### Requirement: Contexts offer Play and Shuffle-Play buttons

Album, playlist, artist, and liked-songs views SHALL show primary Play and
Shuffle buttons that start playback of the whole context.

#### Scenario: Play a context
- **WHEN** the user taps Play on an album/playlist/artist header
- **THEN** playback starts at the first song with the context as the queue

#### Scenario: Shuffle a context
- **WHEN** the user taps Shuffle on a context header
- **THEN** playback starts on a random song with shuffle enabled
