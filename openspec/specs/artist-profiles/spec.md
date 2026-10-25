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

### Requirement: Artist follower count display
The artist detail header MUST display the artist's follower count when the upstream API provides one, formatted compactly (e.g. "1.2M fans").

#### Scenario: Follower count renders
- **WHEN** an artist page loads and the artist payload includes a follower count
- **THEN** the header shows the formatted count near the artist name

#### Scenario: Missing count degrades silently
- **WHEN** the artist payload has no follower count
- **THEN** the header renders without the count line and no error

### Requirement: Discography "Show all" expansion
The artist albums tab MUST initially render a capped subset of the (already fully-fetched) discography with a "Show all" affordance that expands the remaining albums client-side — no additional fetch, since the full list is already in the response.

#### Scenario: Show all expands locally
- **WHEN** an artist has more albums than the initial render cap and the user activates "Show all"
- **THEN** the remaining albums render immediately without a network request

#### Scenario: Short discographies hide the control
- **WHEN** an artist's album count is within the initial cap
- **THEN** no "Show all" control renders
