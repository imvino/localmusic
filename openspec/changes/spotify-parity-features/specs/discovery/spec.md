# Spec Delta

## ADDED Requirements

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
