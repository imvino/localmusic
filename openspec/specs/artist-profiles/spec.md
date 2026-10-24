# artist-profiles

## Purpose

Defines artist profile enrichment: rendering the bio and similar-artists
data that `/api/artist/:id` already returns, plus the artist radio entry
point.

## Requirements

### Requirement: Artist pages show bio and similar artists

The artist detail view SHALL render the artist's bio (collapsible if long)
and a horizontally scrollable row of similar artists, each navigable to that
artist's page. Absent data SHALL render nothing (no empty sections).

#### Scenario: Bio renders
- **WHEN** an artist page loads with bio data
- **THEN** the bio text is shown, collapsed to a preview with expand control when long

#### Scenario: Similar artists row
- **WHEN** an artist page loads with similarArtists data
- **THEN** a tappable row of those artists appears; tapping navigates to that artist

#### Scenario: Missing data
- **WHEN** bio or similarArtists are absent/empty
- **THEN** those sections don't render at all

### Requirement: Artist radio entry point

The artist detail view SHALL offer a Radio control that starts a shuffled
mix of the artist's catalog plus similar-song seeds.

#### Scenario: Start artist radio
- **WHEN** the user taps Radio on an artist page
- **THEN** playback starts with a blended queue (see playback spec)
### Requirement: Artist deep-link sharing

The artist detail view SHALL offer a Share control producing a deep link to the artist page.

#### Scenario: Share an artist
- **WHEN** the user taps Share on an artist page
- **THEN** a deep link to the artist page copies or shares via the OS sheet
