# playlists Specification

## Purpose

Defines user-created playlists: creating, renaming, and deleting playlists;
adding, removing, and reordering their songs; and how playlists appear in
navigation. Playlists are stored locally (self-contained song objects, no
server dependency) in v1.

## Requirements

### Requirement: Users can create, rename, and delete playlists

The app SHALL let users create a named playlist, rename it, and delete it.
Each playlist persists across reloads with its ordered song list.

#### Scenario: Create a playlist
- **WHEN** the user creates a playlist named "Gym"
- **THEN** "Gym" appears in the playlist list and sidebar, and persists after reload

#### Scenario: Rename and delete
- **WHEN** the user renames a playlist or deletes it
- **THEN** the change is reflected everywhere and persists after reload

### Requirement: Songs can be added to, removed from, and reordered in a playlist

The app SHALL let users add any playable song to a playlist (from a track
context menu), remove a song, and change song order. Stored songs are
self-contained (id, name, artist, album, image, local flags) so they render
and play without re-resolution.

#### Scenario: Add song from context menu
- **WHEN** the user picks "Add to playlist" → "Gym" on a song row
- **THEN** the song appears in Gym's track list and is playable

#### Scenario: Remove and reorder
- **WHEN** the user removes a song or moves it up/down in a playlist
- **THEN** the playlist reflects the change immediately and after reload

#### Scenario: Duplicate handling
- **WHEN** the user adds a song already in the playlist
- **THEN** it is either deduplicated or clearly indicated as already added

### Requirement: Playlists are browsable and playable

The app SHALL provide a playlists list view and a per-playlist detail view
showing its songs in order, with play/shuffle controls and the standard
song-row interactions. The sidebar SHALL list playlists under a Library
section.

#### Scenario: Play a playlist
- **WHEN** the user taps a song, or the Play button, in a playlist
- **THEN** playback starts with the playlist as the queue

#### Scenario: Shuffle-play a playlist
- **WHEN** the user taps Shuffle on a playlist
- **THEN** playback starts on a random song with shuffle enabled

#### Scenario: Library section visible without sign-in
- **WHEN** an anonymous (not signed-in) user opens the sidebar
- **THEN** the Library section (playlists, liked) is still visible — the collections are local, not account-bound
