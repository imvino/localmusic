# Spec Delta

## ADDED Requirements

### Requirement: Shareable recap card
Stats MUST offer a "Wrapped"-style recap view that aggregates count-weighted top songs, top artists, and total listening minutes, rendered as a card exportable via the OS share sheet.

#### Scenario: Recap renders personal aggregates
- **WHEN** a signed-in user opens the recap and has play counts
- **THEN** the view shows top songs, top artists, and estimated minutes listened for the available period

#### Scenario: Empty state for new users
- **WHEN** a signed-in user opens the recap with no play counts
- **THEN** a friendly empty state explains the recap builds as they listen (no blank page or NaN values)

#### Scenario: Legacy entries without timestamps still count
- **WHEN** play-count entries carry a zero or missing timestamp (pre-dating the field or merged legacy data)
- **THEN** they are included in an "all-time" aggregate rather than silently dropped

#### Scenario: Card shares as image
- **WHEN** the user chooses "Share" on a device supporting file sharing
- **THEN** a rendered image of the recap card is shared (artwork grid when cross-origin loading succeeds, text-styled card otherwise); where file sharing is unavailable it falls back to a text summary
