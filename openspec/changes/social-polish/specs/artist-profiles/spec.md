# Spec Delta

## ADDED Requirements

### Requirement: Artist pages show bio and similar artists

The artist detail view SHALL render the artist's bio (collapsible if long),
a horizontally scrollable row of similar artists each navigable to that
artist's page, **and a Share control producing a deep link to the artist**.
Absent data SHALL render nothing (no empty sections).

#### Scenario: Bio renders
- **WHEN** an artist page loads with bio data
- **THEN** the bio text is shown, collapsed to a preview with expand control when long

#### Scenario: Similar artists row
- **WHEN** an artist page loads with similarArtists data
- **THEN** a tappable row of those artists appears; tapping navigates to that artist

#### Scenario: Share an artist
- **WHEN** the user taps Share on an artist page
- **THEN** a deep link to the artist page copies or shares via the OS sheet

#### Scenario: Missing data
- **WHEN** bio or similarArtists are absent/empty
- **THEN** those sections don't render at all
