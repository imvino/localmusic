# Spec Delta

## MODIFIED Requirements

### Requirement: Song rows expose a context menu

Song rows across the app SHALL offer a `...` menu with actions appropriate to
the song: Play next, Add to queue, Add to playlist, Go to song radio,
Like/Unlike, Go to album, **View lyrics, and Share**.

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
