# Spec Delta

## ADDED Requirements

### Requirement: Search suggestions endpoint
`GET /api/search/suggestions?q=<query>` SHALL return a compact suggestion list for typeahead: up to ~5 songs and up to ~3 each of albums/artists/playlists. Songs carry `id`, `name`, `type`, `image`, `primaryArtist`, and `explicitContent`; other entities carry `id`, `name`, `type`, `image`. It MUST proxy the upstream suggestions endpoint when available and fall back to a limited upstream song search when it is not (the fallback upstream returns 404 for `/search/suggestions` — verified). It MUST return HTTP 200 with empty groups on upstream failure — never a 5xx — with upstream timeout ≤ 4s.

#### Scenario: Upstream suggestions available
- **WHEN** a client requests `/api/search/suggestions?q=rahman` and the upstream suggestions endpoint responds
- **THEN** the response contains categorized suggestions (songs plus at least one other entity type) in the compact shape

#### Scenario: Upstream suggestions unavailable
- **WHEN** the upstream suggestions endpoint 404s or times out but upstream song search works
- **THEN** the endpoint returns song-only suggestions from the fallback search

#### Scenario: All upstreams down
- **WHEN** every upstream is unreachable
- **THEN** the endpoint returns 200 with empty groups so the UI hides the dropdown

### Requirement: Typeahead dropdown on the header search inputs
The search input lives in the app header — two instances exist (mobile + desktop). Both SHALL show a suggestion dropdown directly beneath their input after the same debounce interval used for results today, and MUST NOT fire a suggestions request for inputs under 2 characters. Selecting a suggestion navigates to that entity (song plays, album/artist/playlist opens); submitting still performs the full search. The dropdown MUST support Escape to close and ArrowUp/ArrowDown + Enter for keyboard navigation, bound to whichever input produced it.

#### Scenario: Type and pick a song
- **WHEN** a user types "vadivel" and clicks a song suggestion
- **THEN** that song begins playback (or is queued per current auth rules) without the user pressing Enter

#### Scenario: Keyboard navigation
- **WHEN** a user types a query in either header input and presses ArrowDown then Enter
- **THEN** the highlighted suggestion activates exactly as if clicked

#### Scenario: Latest-query-wins
- **WHEN** a query's response arrives after the user has typed further
- **THEN** suggestions for the stale query are discarded (sequence check, not AbortController)

#### Scenario: Works for guests
- **WHEN** a guest types in the search input
- **THEN** the dropdown appears identically (search is already guest-permitted)

## MODIFIED Requirements

None — full search submission behavior is unchanged.
