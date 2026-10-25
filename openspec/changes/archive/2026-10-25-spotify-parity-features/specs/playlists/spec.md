# Spec Delta

## ADDED Requirements

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
