# Spec Delta

## Purpose

Defines the browse surfaces that already exist server-side but render
nothing: charts, trending, and featured playlists on the Discover page.

## ADDED Requirements

### Requirement: Discover shows live content rows

Beyond Recently Played/Top Artists/Top Songs, the Discover view SHALL render
Charts, Trending, and Featured Playlists rows sourced from the existing
`/api/charts`, `/api/trending`, `/api/featured-playlists` endpoints. Each item
navigates to its detail page (album/playlist/song as appropriate). Rows with
empty or failed data SHALL not render.

#### Scenario: Charts row
- **WHEN** Discover loads and `/api/charts` returns items
- **THEN** a Charts row renders with tappable entries

#### Scenario: Trending row
- **WHEN** `/api/trending` returns items
- **THEN** a Trending row renders and items navigate correctly

#### Scenario: Empty endpoint
- **WHEN** a content endpoint returns nothing or errors
- **THEN** its row is absent (no skeleton left stuck)
