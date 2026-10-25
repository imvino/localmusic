# Spec Delta

## ADDED Requirements

### Requirement: Weekly Mix
Signed-in members with sufficient listening data SHALL see a "Weekly Mix" — an auto-generated member playlist refilled once per week (Monday boundary), seeded from their top `playCounts` artists and filled via song suggestions, capped at 30 tracks.

Identity is the `weeklyMix: true` marker on the playlist — NEVER the name. If a playlist carrying the marker exists, the mix refills it in place (preserving id, renames, and folder assignment); if none exists one is created. A member renaming the mix MUST NOT trigger a duplicate, and a user-created playlist coincidentally named "Weekly Mix" is left alone. Two devices generating pre-sync MUST converge on one playlist: generation claims a deterministic mix id (`weekly-mix`) via an id-accepting create path in the playlist store.

For convergence, `weeklyMix` and `weeklyMixWeek` MUST round-trip through sync (`slimPlaylists` and the server's `safePlaylists`). Both playlist merges (client `mergePlaylists` and the server PUT union) MUST give the `weekly-mix` playlist **replace semantics keyed on `weeklyMixWeek`**: the copy with the newer `weeklyMixWeek` (ties broken by `updatedAt`) replaces the `songs` array wholesale — the generic union path MUST NOT apply, or week-2 refills grow the mix unboundedly (30-cap violation).

Generation deduplicates against `hiddenSongs`/`hiddenArtists` (content-controls) and never runs for guests. If fewer than 3 distinct top artists exist, the mix is not generated. If the member deletes the mix, the playlist tombstone blocks recreation only while its timestamp is newer than the current week's start; a tombstone from a prior week does not block a new week's generation.

#### Scenario: Monday refill in place
- **WHEN** a member opens the app on a new week and a `weeklyMix` playlist exists with a stale `weeklyMixWeek`
- **THEN** the same playlist's songs are replaced with fresh suggestions and `weeklyMixWeek` updates — same id, name, folderId preserved

#### Scenario: Rename does not duplicate
- **WHEN** a member renames their Weekly Mix to "Sunday Jam" and a new week starts
- **THEN** the marked playlist refills in place — no second "Weekly Mix" is created

#### Scenario: Two devices generate concurrently
- **WHEN** two devices generate a mix before either syncs
- **THEN** both produce the same playlist id (`weekly-mix`) and the merged result is one playlist with the newer week's songs, not a union

#### Scenario: Week-2 refill stays capped
- **WHEN** a mix generated in week N syncs, then week N+1's refill happens on any device
- **THEN** the merged playlist still holds ≤30 tracks — the new week's songs REPLACE, never union

#### Scenario: Insufficient listening data
- **WHEN** a member has fewer than 3 distinct artists in playCounts
- **THEN** no Weekly Mix is generated or surfaced

#### Scenario: Respects hidden content
- **WHEN** a suggestion for a hidden song or hidden artist would enter the mix
- **THEN** it is excluded before the playlist is written

#### Scenario: Guest sees nothing
- **WHEN** a guest browses Discover
- **THEN** no Weekly Mix rail renders and no generation occurs

## MODIFIED Requirements

None.
