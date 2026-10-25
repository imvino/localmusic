# Spec Delta — storage (modified)

*Applies on top of the batch-3 `storage` spec, which this change also
archives into `openspec/specs/` as part of its verification gate.*

## ADDED Requirements

### Requirement: Durable tables for shares, play events, and client errors
The SQLite store SHALL gain `shares`, `play_events`, and `client_errors`
tables created idempotently at startup alongside the existing user-docs
table. Each MUST be write-path indexed appropriately (share code lookup;
member+time windows; error recency) and MUST have retention enforcement
(TTL sweeps or bounded rows) so none can grow without limit.

#### Scenario: Tables exist on fresh boot
- **WHEN** the server starts (empty or existing `app.db`)
- **THEN** all three tables exist and accept writes without migrations
  blocking startup

#### Scenario: JSON fallback degrades these features, not the app
- **WHEN** the SQLite backend is unavailable and the JSON fallback store is
  active
- **THEN** share creation, event capture, and error logging degrade to
  explicit unavailability (endpoints respond safely, e.g. 503 or fallback
  payload link) rather than crashing — the core library store keeps working

#### Scenario: Retention actually sweeps
- **WHEN** records exceed the configured retention
- **THEN** a periodic or on-write sweep removes expired rows (verified, not
  assumed)
