# Tasks

## 1. Dependency + env + gitignore
- [x] 1.1 `npm install postgres` (pin published ≥7d)
- [x] 1.2 `.env.example`: `DATABASE_URL` — session-mode pooler port 5432 + `sslmode=require`, note IPv6/prepared-statement trap, single-instance warning
- [x] 1.3 `.gitignore`: add `data/app.db.imported*`

## 2. store.js — pg backend
- [x] 2.1 `makePgBackend()` — memory view, one serialized write chain per table, dirty-set with current-state re-snapshot retries (backoff 1s→60s), 10k dirty cap, SIGTERM flush (bounded ~3s)
- [x] 2.2 Idempotent DDL (users/shares/play_events `BIGINT IDENTITY`/client_errors + indexes)
- [x] 2.3 `init()` — session-pooler connect (`connect_timeout:5`, `ssl`), retry ~6×/60s budget for paused-project resume; hydrate all tables into memory
- [x] 2.4 Reconcile/import — per-row newest-ts merge sqlite→pg in ONE transaction (`ON CONFLICT DO NOTHING`); on clean boot: `wal_checkpoint(TRUNCATE)` → rename `app.db`(+wal/shm) → `app.db.imported*`
- [x] 2.5 Pg boot failure → copy `app.db.imported` → `app.db` first, then select sqlite (snapshot, never empty store)
- [x] 2.6 Accessor parity against memory + write-through; createShare/deleteShare return settlement promise; listClientErrors from memory
- [x] 2.7 `store.name` exposed; no-op `init()` on sqlite/json backends

## 3. server.js
- [x] 3.1 `store.init().then(() => server.listen(PORT, ...))`
- [x] 3.2 share routes await `createShare`/`deleteShare` settlement; `/s/:code` miss sends `Cache-Control: no-store`
- [x] 3.3 `/api/health` reports `backend: store.name`

## 4. Verification
- [x] 4.1 No-env regression: sqlite path unchanged, 68/68 tests, clean build
- [x] 4.2 Live: real Postgres (docker pg:16) → `DATABASE_URL` → boot → import verified → write → restart → survives
- [x] 4.3 Failure drill: unreachable `DATABASE_URL` → boots on sqlite with snapshot restored, health reports `sqlite`
- [x] 4.4 LWW drill: force failed write → newer write → confirm pg converges to newer value
- [x] 4.5 Commit
