# stats

## Purpose

Defines the listening-stats view derived from local play history — a
Spotify Wrapped-lite surface at `/stats`.

## Requirements

### Requirement: Stats view shows listening activity

A `/stats` route SHALL render: total plays, estimated minutes listened
(summed track durations), top songs, and top artists — computed from
`playHistory`, plus the liked-songs count. Empty history SHALL render an
empty state, not an error.

#### Scenario: Stats render
- **WHEN** the user opens /stats with recorded history
- **THEN** totals, top songs (with artwork), and top artists display

#### Scenario: Empty history
- **WHEN** playHistory is empty or corrupt
- **THEN** the view shows an empty state suggesting the user start listening
