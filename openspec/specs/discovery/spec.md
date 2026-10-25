# discovery

## Purpose

Defines the browse surfaces that already exist server-side but render
nothing: charts, trending, and featured playlists on the Discover page.

## Requirements

### Requirement: Discover shows live content rows

Beyond Recently Played/Top Artists/Top Songs, the Discover view SHALL render
Charts and Trending rows sourced from `/api/charts` and `/api/trending`, plus
the pre-existing Featured Playlists row (`/api/jio/featured-playlists`). Each
item navigates to its detail page (album/playlist/song as appropriate). Rows
with empty or failed data SHALL not render.

#### Scenario: Charts row
- **WHEN** Discover loads and `/api/charts` returns items
- **THEN** a Charts row renders with tappable entries

#### Scenario: Trending row
- **WHEN** `/api/trending` returns items
- **THEN** a Trending row renders and items navigate correctly

#### Scenario: Empty endpoint
- **WHEN** a content endpoint returns nothing or errors
- **THEN** its row is absent (no skeleton left stuck)

### Requirement: New-from-followed-artists rail
Discover MUST surface a rail of new releases from artists the signed-in user follows, populated by matching followed-artist names against artist fields in trending content (the only rail carrying artist attribution today; featured-artist matches are accepted noise). Guests MUST NOT see this rail.

#### Scenario: Member sees new releases from followed artists
- **WHEN** a signed-in user follows at least one artist and trending content contains items by a followed artist (primary or featured)
- **THEN** Discover shows a "New from artists you follow" rail containing those items

#### Scenario: Guest sees no personalization
- **WHEN** a signed-out user loads Discover
- **THEN** no followed-artist rail renders

#### Scenario: Name matching tolerates case/punctuation variance
- **WHEN** comparing followed-artist names to trending artist fields
- **THEN** matching is case-insensitive and ignores punctuation variance (e.g. "A. R. Rahman" matches "AR Rahman")

### Requirement: Artist-clustered daily mixes
Discover MUST generate up to three "Daily Mix" cards by clustering the user's durable play counts by artist. Each mix is seeded from the user's own most-played songs for that artist and filled out via the song-suggestions endpoint — it MUST NOT trigger full artist-page fetches.

#### Scenario: Member with listening history sees mixes
- **WHEN** a signed-in user has play counts spanning at least one artist
- **THEN** up to three Daily Mix cards appear, each named for a top-played artist and playable as a list

#### Scenario: Cold cache stays fast
- **WHEN** the mixes rail renders on a fresh load
- **THEN** it issues at most one suggestions request per mix (≤3 total), not full artist-profile fetches

#### Scenario: No history, no mixes
- **WHEN** the user has no play counts
- **THEN** no Daily Mix cards render

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

### Requirement: Daily Mixes draw from multiple artists
Each Daily Mix MUST seed from multiple distinct artists drawn from the
member's weighted play history — not a single-artist cluster — with a
per-artist cap on both seeds and suggestion fill so no artist dominates.
Mix titles MAY name the lead artist (e.g. "Daily Mix 1 — A.R. Rahman &
more") but the song list MUST be audibly multi-artist.

#### Scenario: One artist no longer fills a mix
- **WHEN** a member's top plays cluster heavily on one artist
- **THEN** each Daily Mix still contains songs from at least three distinct
  artists (when the member's history supports it), capped per artist like
  the Weekly Mix

#### Scenario: Sparse history stays graceful and honest
- **WHEN** a member's history has only 1-2 artists
- **THEN** the resulting mix is honestly named for that artist rather than
  fabricating breadth — and with no usable history at all, no empty/broken
  mix renders

#### Scenario: Suggestion fill is also capped
- **WHEN** a mix tops up via the suggestions endpoint
- **THEN** fill pulls from seeds across distinct artists and the per-artist
  cap applies to the combined seeds+fill list

#### Scenario: Suggestion calls stay bounded
- **WHEN** the day's mixes generate
- **THEN** at most 3 suggestion calls fire per mix (≤9 total), parallel and
  day-cached — the mixes never trigger an unbounded fetch fan-out

### Requirement: Editorial mood rails on Discover
Discover SHALL surface mood/genre rails sourced from the catalog's own
editorial endpoints (moods/genres channels verified reachable on the app's
existing upstream mirrors) — e.g. Romance, Sad, Dance/Kuthu — mapped to
playlist/content rails, subject to the same language preference and content
filters as other rails.

#### Scenario: Mood rail renders for a member
- **WHEN** a member opens Discover
- **THEN** at least one mood/genre rail appears with playable catalog
  content, filtered by the member's content-language preference where
  metadata exists

#### Scenario: Upstream mood endpoint fails
- **WHEN** the editorial endpoint errors or returns nothing usable
- **THEN** the rail falls back to curated mood→search mappings if the client
  ships them; if no fallback content resolves either, the rail is omitted
  silently — Discover always renders fully
