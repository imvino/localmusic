# Spec Delta — discovery (modified)

## ADDED Requirements

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
