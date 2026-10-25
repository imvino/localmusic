# storage Specification

## Purpose
Server-side durable storage for member library documents and secondary
feature data (shares, play events, client errors): SQLite primary with a
JSON-file fallback so a native-module failure degrades features, never the
app.

## Requirements

### Requirement: SQLite-backed user library documents
Per-user library documents SHALL be stored in a single SQLite database at
`data/app.db` via `better-sqlite3`, keyed by Clerk `userId`. The storage layer
MUST preserve the existing `loadUserData(userId)` / `saveUserData(userId, doc)`
function contract so no route code changes. Writes MUST be atomic upserts
(`INSERT ... ON CONFLICT(user_id) DO UPDATE`), not read-modify-write of files.

#### Scenario: PUT then GET round-trips
- **WHEN** a member PUTs their library then GETs it
- **THEN** the merged document is returned byte-for-byte identical to what the
  JSON-file store would have produced

#### Scenario: Two devices write concurrently
- **WHEN** two devices PUT the same user's library near-simultaneously
- **THEN** neither write is lost mid-write (each upsert commits atomically);
  last-write-wins ordering matches the existing file behavior

### Requirement: One-time JSON→SQLite migration
On server start, if `data/users/*.json` exists and a `user_id` row is absent
from `app.db`, the server SHALL import the file's parsed JSON into that row.
A successfully imported file MUST be moved to `data/users/migrated/` (never
deleted) so rollback is possible and re-import is idempotent. A file that
fails to parse MUST be moved to `data/users/migrated/failed/` with a logged
warning — never deleted, never re-warned on every boot, and it must not
block other imports.

#### Scenario: Existing data survives the upgrade
- **WHEN** the server starts with three pre-existing `data/users/*.json` docs
- **THEN** all three are readable via `loadUserData` and the files sit under
  `data/users/migrated/`

#### Scenario: Corrupt file doesn't warn-loop
- **WHEN** one of the JSON files is unparseable
- **THEN** it is moved to `migrated/failed/`, a warning is logged once, the
  other files still import, and a subsequent boot emits no new warning

#### Scenario: Fresh install with no legacy files
- **WHEN** the server starts with no `data/users/` directory
- **THEN** `app.db` is created empty and all routes work normally

### Requirement: Fallback when better-sqlite3 cannot load
If `require('better-sqlite3')` throws (missing native binary on an exotic
platform), the server SHALL log a warning and fall back to the existing
JSON-file implementation rather than crash. `loadUserData`/`saveUserData`
semantics stay identical under either backend. The fallback backend MUST
also read `data/users/migrated/` (a post-migration native-module failure
must not hide previously migrated users) — newest file timestamp wins on
duplicate user ids.

#### Scenario: Native module fails AFTER migration
- **WHEN** users were migrated to `data/users/migrated/` and a later boot
  cannot load better-sqlite3
- **THEN** the JSON fallback still serves every migrated user's document

#### Scenario: Native module unavailable
- **WHEN** better-sqlite3 fails to load
- **THEN** the server starts anyway, user sync works via JSON files, and a
  warning is logged once

### Requirement: Family activity reads via indexed query
`GET /api/family/activity` MUST read opted-in member rows through the same
storage functions — it SHALL NOT parse JSON files directly. With SQLite, the
query MAY iterate all rows (a single deployment = one household, tens of
rows), but MUST NOT read `data/users/` directly.

#### Scenario: Activity feed works identically post-migration
- **WHEN** members with `shareActivity` on have history entries
- **THEN** `/api/family/activity` returns the same rows it did under JSON storage

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
