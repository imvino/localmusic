# liked-songs Specification

## Purpose

Defines the Liked Songs collection as a first-class screen: the songs a user
has hearted become browsable and playable, not write-only data.

## Requirements

### Requirement: Liked songs are listed on a dedicated screen

The app SHALL provide a Liked Songs view listing every song in the user's
liked set, resolved from song IDs to full metadata (title, artist, album,
artwork) via a batch lookup. Songs that fail to resolve SHALL be skipped
without breaking the list.

#### Scenario: Open Liked Songs
- **WHEN** the user has liked songs and opens the Liked Songs view
- **THEN** all resolvable liked songs render as a playable song list

#### Scenario: Empty liked set
- **WHEN** the user has no liked songs
- **THEN** the view shows an empty state prompting them to like songs

#### Scenario: Newest likes first
- **WHEN** the user opens Liked Songs
- **THEN** the most recently liked songs appear first

#### Scenario: Local liked songs resolve correctly
- **WHEN** a liked song exists in the local library
- **THEN** it shows its LOCAL badge and streams from the local file

### Requirement: Liked songs play as a queue

Tapping a song in the list SHALL start playback with the liked-song list as
the queue; the view SHALL offer Play and Shuffle controls.

#### Scenario: Play from liked list
- **WHEN** the user taps a liked song
- **THEN** it plays with the remaining liked songs as the queue context

### Requirement: Unliking removes from the list

When a song is unliked, it SHALL disappear from the Liked Songs view.

#### Scenario: Unlike in place
- **WHEN** the user unhearts a song from within the Liked Songs view
- **THEN** it is removed from the displayed list

### Requirement: Liked songs count
The sidebar and library MUST display the number of liked songs next to the Liked Songs entry.

#### Scenario: Count reflects current library
- **WHEN** a signed-in user's liked set changes
- **THEN** the displayed count updates to match
