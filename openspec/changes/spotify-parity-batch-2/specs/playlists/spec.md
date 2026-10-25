# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

None — existing playlist create/delete/share requirements are unchanged.
