# Spec Delta

## ADDED Requirements

### Requirement: Private session mode
The user MUST be able to toggle a private session that suspends writing play history and play counts for the duration, with a visible indicator while active. Private session is device-scoped and MUST NOT sync.

#### Scenario: Private session records nothing
- **WHEN** private session is enabled and songs play
- **THEN** no entries are added to play history or play counts, and playback is unaffected

#### Scenario: Indicator visible
- **WHEN** private session is enabled
- **THEN** a subtle indicator is visible in the app chrome so the user knows tracking is off

#### Scenario: Resuming restores tracking
- **WHEN** private session is disabled
- **THEN** subsequent plays record history and counts normally
