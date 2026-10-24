# Spec Delta

## Purpose

Defines search interaction quality: debounced queries, recent searches, and
as-you-type suggestions so search feels instant instead of hammering the API.

## ADDED Requirements

### Requirement: Search input is debounced

Typing in the search field SHALL NOT fire a request per keystroke; queries
issue after ~300ms of no input.

#### Scenario: Rapid typing
- **WHEN** the user types 5 characters within 300ms
- **THEN** at most one search request issues (for the final text)

### Requirement: Recent searches are remembered

The empty-query search view SHALL list recent searched terms (newest first,
persisted locally); tapping one re-runs it; a clear control removes them.

#### Scenario: Search history shown
- **WHEN** the search view opens with an empty query and prior searches exist
- **THEN** recent terms render as tappable rows

#### Scenario: Selecting a recent search
- **WHEN** the user taps a recent term
- **THEN** the field fills and results for it load
