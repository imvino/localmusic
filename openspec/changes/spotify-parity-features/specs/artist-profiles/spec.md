# Spec Delta

## ADDED Requirements

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
