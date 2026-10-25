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

### Requirement: Playlist folders
The user MUST be able to organize playlists into named folders shown as collapsible groups in the playlists view and sidebar. Folder assignment MUST sync across devices with the playlist.

#### Scenario: Create folder and assign
- **WHEN** a signed-in user creates a folder and moves a playlist into it
- **THEN** the playlist renders inside the collapsible folder group and the folder id persists through library sync

#### Scenario: Guests see no folders
- **WHEN** a signed-out user views the sidebar or playlists route
- **THEN** no folder UI renders (routes remain gated)

### Requirement: Folder deletion propagates
Folder deletion MUST propagate across devices via tombstones (same mechanism as playlist deletion); a deleted folder MUST NOT resurrect on another device's push. Playlists inside a deleted folder MUST be un-filed, not deleted.

#### Scenario: Cross-device folder delete
- **WHEN** device A deletes a folder and syncs, then device B syncs
- **THEN** the folder is gone on B and its member playlists render un-filed

#### Scenario: Concurrent add survives delete correctly
- **WHEN** device A deletes folder F while offline device B adds playlist P to F, then both sync
- **THEN** F stays deleted (folder tombstone wins), and P survives un-filed — no data loss

#### Scenario: Backup-imported folder restores with membership
- **WHEN** a folder is restored via backup import (restamps `createdAt`/`updatedAt`, clears its tombstone)
- **THEN** it survives the merge since its timestamps postdate the tombstone, and member playlists regain membership because their `folderId` is preserved on import

#### Scenario: Pinned playlist inside a folder renders pinned
- **WHEN** a playlist is both pinned and assigned to a folder
- **THEN** it renders in the pinned section (pinning wins over folder grouping)

### Requirement: Playlist sort menu
The playlist detail view SHALL provide a sort menu with options: **Custom** (the playlist's stored order — the default), Oldest (reverse stored order), Title, Artist. Non-custom sorts are view-only and MUST NOT mutate stored song order. The header's Play/Shuffle always operate on stored order; when a non-custom sort is active the row-number column shows the displayed sequence (1..n), not stored indices.

#### Scenario: Sort by title
- **WHEN** a member opens a playlist and selects "Title" in the sort menu
- **THEN** rows render alphabetically by song title, numbered 1..n in display order, and the stored `songs` array is unchanged

#### Scenario: Custom order is the default
- **WHEN** a member opens a playlist
- **THEN** rows render in the playlist's stored order

### Requirement: Drag-to-reorder playlist songs
When the custom sort is active, the playlist detail view SHALL let members reorder songs by dragging a row on desktop (HTML5 drag-and-drop, the same pattern `QueueDrawer` uses). Reorder MUST route through `moveSong` so `updatedAt` bumps and the new order syncs cross-device. On touch devices the existing up/down arrows are the reorder control — they MUST stay visible whenever custom sort is active, on every platform (HTML5 drag on touch browsers is inconsistent — Chrome Android supports long-press drag, Safari does not — so arrows are the defined touch path, not a degraded fallback). While a non-custom sort is active, all reorder controls (drag and arrows) MUST be hidden because indices no longer map to stored order.

#### Scenario: Drag row 3 to position 10 (desktop)
- **WHEN** a member drags the third song row onto the tenth position with custom sort active
- **THEN** the song moves to index 9 in the stored `songs` array, `updatedAt` updates, and the change pushes via library sync

#### Scenario: Touch reorder via arrows
- **WHEN** a member on a touch device reorders with the arrow buttons
- **THEN** the same stored reorder result is produced

#### Scenario: Sorting hides reorder
- **WHEN** a member switches the sort to "Title"
- **THEN** drag handles and up/down arrows are not rendered until they return to custom order

### Requirement: Playlist sharing produces a short server link
The Share action on a playlist SHALL POST the playlist payload to the share
endpoint and copy the returned short `/s/:code` URL (see the `share-links`
capability for server behavior). If the endpoint fails, the client MUST fall
back to the existing base64 `/shared/:data` payload URL so sharing never
breaks offline. The share sheet content is otherwise unchanged.

#### Scenario: Share copies a short link
- **WHEN** a signed-in member shares a playlist with the server reachable
- **THEN** the clipboard contains `https://<host>/s/<code>`, not a
  multi-kilobyte base64 URL

#### Scenario: Fallback preserves sharing
- **WHEN** the share endpoint is unreachable or rejects the payload
- **THEN** the client copies a working `/shared/:data` link and, if
  distinguishable, notes the link is the long form

#### Scenario: Local-file handling preserved
- **WHEN** the playlist contains local files
- **THEN** the short-link payload excludes them with the same `lc` marker
  semantics the payload encoder uses today
