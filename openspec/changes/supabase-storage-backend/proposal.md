# Proposal

## Why

Render's free tier has an ephemeral filesystem — `data/app.db` (better-sqlite3) is wiped on every redeploy. Every member's synced library, history, shares, and play events are lost on each deploy. Once the family depends on the app, storage must outlive the process.

## What Changes

- Add a third storage backend: **Postgres (Supabase-hosted)**, selected when `DATABASE_URL` is set. Falls back to SQLite → JSON files exactly as today when unset/unreachable.
- The backend **preserves the synchronous store contract** (`load`/`save`/`all` + share/event/error accessors) by hydrating all tables into memory at boot and writing through asynchronously with retry.
- One-time import: when Postgres is empty and a local `app.db` exists, all existing rows are imported on first boot — zero-downtime data cutover.
- Boot becomes async (`await store.init()` before `server.listen`) — hydration must complete before serving requests so no stale/empty reads leak.
- Graceful degradation inside the pg backend: failed writes mark rows dirty and retry; a boot hydration failure falls back to sqlite rather than crashing.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `storage`: adds Postgres backend requirements — boot hydration, async write-through with dirty-retry, connection-failure fallback ordering, one-time sqlite→pg import, and Supabase pause/reconnect behavior.

## Impact

- `src/store.js` — new `pgBackend` alongside sqlite/json; `init()` async lifecycle added.
- `src/server.js` — boot awaits `store.init()` before `server.listen`; unchanged everywhere else (sync contract preserved).
- New dependency: `postgres` (pg driver).
- `openspec/specs/storage/spec.md` — delta additions.
- Env: `DATABASE_URL` (Supabase Postgres connection string) — never committed; documented in `.env.example`.
