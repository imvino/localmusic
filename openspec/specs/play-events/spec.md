# play-events Specification

## Purpose
Capture per-member play events (who played what, when, in which session)
so a future household co-play recommendation graph has the adjacency data
it needs — data the capped play-history aggregate can never provide and
that cannot be backfilled later. Durability equals deployment durability:
while the server disk is ephemeral the table is best-effort capture; the
schema and write path are what this change guarantees.

## Requirements

### Requirement: Qualifying plays are captured as events
When a play qualifies under the existing play-counting threshold rules, the
client SHALL send a play event to the server (e.g. `POST /api/play-events`)
and the server MUST append it to a durable `play_events` SQLite table with
at minimum: member id, song id, server timestamp, and a session/device
grouping key. Skips below the threshold are NOT events (the skip-count
signal already covers them).

#### Scenario: A real listen lands in the table
- **WHEN** a signed-in member crosses the play threshold on a song
- **THEN** exactly one event row exists for that listen (resume/rebuffer does
  not double-count, mirroring playCount semantics; a mid-listen page reload
  may re-fire the threshold, same accepted caveat playCounts already has)

#### Scenario: Guests write nothing
- **WHEN** an unauthenticated session would emit a play event
- **THEN** no network call is made and nothing is persisted

#### Scenario: Server stamps time
- **WHEN** an event arrives
- **THEN** the stored timestamp is server-generated (client clocks are never
  trusted)

### Requirement: Privacy gates apply to capture
Private-session mode MUST suppress play-event emission just as it suppresses
playCounts/history/presence today. Each stored row's privacy flag MUST be
**server-derived** from the member's own `shareActivity` preference at write
time (never client-declared) — events captured while sharing is off MUST
remain private to that member's own data.

#### Scenario: Private session records nothing
- **WHEN** a member plays with private session enabled
- **THEN** no play event is emitted or stored

### Requirement: Capture survives offline
If the event POST fails, the client MUST buffer events and retry on the next
sync opportunity (aligned with the existing member-sync machinery), bounded
so the buffer cannot grow without limit.

#### Scenario: Offline plays are not lost
- **WHEN** a member listens while the server is unreachable
- **THEN** the events are delivered when connectivity returns, marked as
  buffered so stale bulk delivery cannot distort "listening now"-style
  features

### Requirement: The table is bounded and indexed
`play_events` MUST have a retention policy (12-month TTL plus a per-member
row cap, swept on write) and indexes supporting per-member and
recent-window queries, since this table grows with every play.

#### Scenario: Events queryable for future mining
- **WHEN** a future feature asks "what did members play near each other"
- **THEN** the schema supports session-adjacency queries without a full scan

### Requirement: No user-facing surface in this change
This change MUST NOT ship any recommendation/graph UI on top of
`play_events` — capture only. Any consumer is a separate future change.

#### Scenario: Invisible to members
- **WHEN** a member uses the app
- **THEN** nothing in the UI reveals that events are being recorded beyond
  existing privacy surfaces
