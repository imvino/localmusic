# Spec Delta — storage

## ADDED Requirements

### Requirement: Postgres backend selected by DATABASE_URL
When `DATABASE_URL` is set, the storage layer SHALL use a Postgres backend
(hosted e.g. Supabase) in preference to SQLite. When unset, behavior is
unchanged: SQLite → JSON fallback chain applies exactly as today. At most
ONE running server instance may hold `DATABASE_URL` — the backend keeps an
in-memory authoritative view, so concurrent instances would diverge and
clobber each other; this is a documented deployment precondition, not
enforced by code.

#### Scenario: No env var, unchanged behavior
- **WHEN** `DATABASE_URL` is not set
- **THEN** the server uses SQLite exactly as before with zero behavior change

### Requirement: Boot hydration preserves the synchronous contract
All persisted tables SHALL be hydrated into memory during `init()` before
`server.listen` accepts requests. `load`/`save`/`all` and every batch-4
accessor keep their existing synchronous signatures — no route code
changes. Reads serve from the hydrated in-memory view.

#### Scenario: No request observes a partially-hydrated store
- **WHEN** the server is mid-hydration
- **THEN** it is not yet listening — every request sees either the fully
  hydrated store or a fallback backend

### Requirement: Async write-through preserves last-write-wins
`save` and mutating accessors SHALL update memory synchronously and
enqueue a Postgres write on a serialized queue. A failed write marks the
entity dirty; a retry SHALL write the entity's current in-memory state at
retry time and MUST be a no-op when a newer write for the same key has
already succeeded — a stale retry MUST NOT clobber a newer committed
value. Process shutdown SHALL attempt a bounded-time flush of pending
writes. The dirty backlog SHALL be bounded; overflow is logged, never
silent.

#### Scenario: Failed write followed by newer write
- **WHEN** save V1 fails and save V2 for the same key succeeds before V1's
  retry fires
- **THEN** Postgres converges to V2 — V1's retry writes nothing

#### Scenario: Transient pg failure mid-session
- **WHEN** Postgres drops briefly during normal operation
- **THEN** affected writes retry automatically once the connection returns;
  reads remain correct throughout

### Requirement: Share writes are durable before response
`createShare`/`deleteShare` SHALL NOT respond to the client until the
Postgres write has settled (the accessor returns a settlement promise the
route awaits; other backends resolve immediately). A share link the user
holds MUST NOT 404 because of a write-through window. `/s/:code` misses
SHALL respond `Cache-Control: no-store` — a transient miss must not be
cached past the row's existence.

#### Scenario: Share survives a crash
- **WHEN** a member creates a share link and the server crashes
  immediately after
- **THEN** the link still resolves — the response only went out after the
  row landed

### Requirement: Pg-down fallback serves the pre-cutover snapshot
If Postgres boot hydration fails, the server SHALL restore
`data/app.db.imported` → `data/app.db` (when present) before selecting the
SQLite backend — never serve an empty store over a renamed snapshot.
Writes during the fallback window land in SQLite. On the next successful
pg boot the server SHALL reconcile per-row: any SQLite row newer than its
pg counterpart is upserted into pg. The import/fallback cycle MUST be
idempotent and MUST NOT lose writes made during the fallback window.

#### Scenario: Paused project, fallback window, recovery
- **WHEN** pg is down at boot, members write to the restored sqlite
  snapshot, and pg comes back next boot
- **THEN** all fallback-window writes are merged into pg by newest-timestamp
  and the sqlite file is snapshotted to `.imported` again

### Requirement: SQLite→Postgres import preserves a restorable snapshot
Before renaming `app.db` to `app.db.imported`, the server SHALL run
`wal_checkpoint(TRUNCATE)` (a live WAL file is not part of the snapshot)
and rename any `-wal`/`-shm` files alongside. The import SHALL run in a
single transaction with `ON CONFLICT DO NOTHING` so partial imports are
impossible and re-runs are safe. `data/app.db.imported*` SHALL be
gitignored.

#### Scenario: Existing household data survives cutover
- **WHEN** Postgres is enabled on a server with a populated `app.db`
- **THEN** every member doc, share, event, and error row is queryable via
  the store API after boot, and `app.db.imported` holds a complete
  checkpointed copy for rollback

### Requirement: Supabase free-tier pause tolerance
The Postgres backend MUST tolerate Supabase's paused-project cold start
(first connect may take ~30s) with a wall-clock-bounded connect retry at
boot (`connect_timeout` SHALL be ≤5s per attempt), and MUST auto-reconnect
a dropped connection during operation. SSL SHALL be required. The
documented connection string SHALL be the session-mode pooler (port 5432)
— direct connections are IPv6-only and unreachable from Render, and the
transaction-mode pooler rejects prepared statements.

#### Scenario: Paused project wakes on boot
- **WHEN** the Supabase project is paused and the server starts
- **THEN** boot hydration retries until the project resumes (within the
  budget) rather than immediately falling back

### Requirement: Active backend is observable
`/api/health` SHALL report which storage backend is active
(`pg`/`sqlite`/`json`). Silent backend degradation is not acceptable —
each backend transition logs a distinct ERROR-level reason.

#### Scenario: Operator checks which backend is live
- **WHEN** pg silently failed over to sqlite at boot
- **THEN** `GET /api/health` reports `backend: "sqlite"`, not a generic ok
