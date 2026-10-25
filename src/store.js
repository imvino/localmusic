// Per-user library document storage — SQLite (better-sqlite3) primary,
// JSON-file fallback when the native module can't load. Same contract as
// the old data/users/<userId>.json functions: load/save/all are synchronous.
//
// Migration: on init, data/users/*.json files are imported into the DB
// (row absent → INSERT; row older than file mtime → UPDATE) then moved to
// data/users/migrated/. Unparseable files go to migrated/failed/ — logged
// once, never deleted, never warn-looped. The JSON fallback backend scans
// BOTH dirs so a post-migration native failure still serves every user.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const USER_DATA_DIR = path.join(DATA_DIR, 'users');
const MIGRATED_DIR = path.join(USER_DATA_DIR, 'migrated');
const FAILED_DIR = path.join(MIGRATED_DIR, 'failed');
const DB_PATH = path.join(DATA_DIR, 'app.db');

// ─── JSON-file backend (fallback) ───────────────────────────────────────────
function jsonFileFor(dir, userId) {
  return path.join(dir, `${userId}.json`);
}

const jsonBackend = {
  name: 'json',
  load(userId) {
    try {
      // Migrated dir too — a post-migration native failure must not hide
      // users already moved there. Newest mtime wins on duplicates.
      let best = null, bestMtime = -1;
      for (const dir of [USER_DATA_DIR, MIGRATED_DIR]) {
        const f = jsonFileFor(dir, userId);
        if (!fs.existsSync(f)) continue;
        const m = fs.statSync(f).mtimeMs;
        if (m > bestMtime) { bestMtime = m; best = f; }
      }
      if (!best) return null;
      return JSON.parse(fs.readFileSync(best, 'utf8'));
    } catch (e) {
      console.error('store.load(json) error:', e.message);
      return null;
    }
  },
  save(userId, data) {
    try {
      fs.mkdirSync(USER_DATA_DIR, { recursive: true });
      fs.writeFileSync(jsonFileFor(USER_DATA_DIR, userId), JSON.stringify(data));
    } catch (e) {
      console.error('store.save(json) error:', e.message);
    }
  },
  all(cb) {
    try {
      for (const dir of [USER_DATA_DIR, MIGRATED_DIR]) {
        let files;
        try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch { continue }
        for (const f of files) {
          const uid = f.replace(/\.json$/, '');
          try { cb(uid, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) } catch { /* skip corrupt */ }
        }
      }
    } catch (e) {
      console.error('store.all(json) error:', e.message);
    }
  },
  // batch-4 features degrade to explicit unavailability under the fallback
  createShare() { throw new Error('storage unavailable') },
  getShare() { return null },
  deleteShare() { return false },
  addPlayEvent() { throw new Error('storage unavailable') },
  addClientError() { throw new Error('storage unavailable') },
  listClientErrors() { return [] }
};

// ─── SQLite backend ─────────────────────────────────────────────────────────
function makeSqliteBackend() {
  const Database = require('better-sqlite3'); // throws when native binary missing
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    doc     TEXT NOT NULL,
    ts      INTEGER NOT NULL
  )`);
  // batch-4 tables — created idempotently alongside users
  db.exec(`CREATE TABLE IF NOT EXISTS shares (
    code       TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    owner_id   TEXT NOT NULL,
    owner_name TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS play_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL,
    song_id    TEXT NOT NULL,
    artist_key TEXT,
    played_at  INTEGER NOT NULL,
    session_id TEXT,
    shared     INTEGER NOT NULL DEFAULT 1,
    buffered   INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_user_time ON play_events(user_id, played_at)`);
  db.exec(`CREATE TABLE IF NOT EXISTS client_errors (
    signature   TEXT PRIMARY KEY,
    user_id     TEXT,
    message     TEXT,
    stack       TEXT,
    route       TEXT,
    user_agent  TEXT,
    app_version TEXT,
    count       INTEGER NOT NULL DEFAULT 1,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
  )`);

  const SHARE_TTL_MS = 90 * 24 * 60 * 60 * 1000;         // 90 days
  const EVENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;        // 12 months
  const EVENT_CAP_PER_USER = 2000;
  const ERROR_ROW_CAP = 1000;

  const getStmt = db.prepare('SELECT doc FROM users WHERE user_id = ?');
  const getTsStmt = db.prepare('SELECT ts FROM users WHERE user_id = ?');
  const upsertStmt = db.prepare(`INSERT INTO users (user_id, doc, ts)
    VALUES (@id, @doc, @ts)
    ON CONFLICT(user_id) DO UPDATE SET doc = @doc, ts = @ts`);
  const allStmt = db.prepare('SELECT user_id, doc FROM users');

  // shares
  const insShareStmt = db.prepare(`INSERT INTO shares (code, payload, owner_id, owner_name, created_at, expires_at)
    VALUES (@code, @payload, @ownerId, @ownerName, @now, @exp)`);
  const getShareStmt = db.prepare('SELECT payload, owner_name, expires_at FROM shares WHERE code = ?');
  const delShareStmt = db.prepare('DELETE FROM shares WHERE code = ? AND owner_id = ?');
  const sweepSharesStmt = db.prepare('DELETE FROM shares WHERE expires_at < ?');
  // play events
  const insEventStmt = db.prepare(`INSERT INTO play_events (user_id, song_id, artist_key, played_at, session_id, shared, buffered)
    VALUES (@uid, @sid, @akey, @ts, @sess, @shared, @buf)`);
  const sweepEventsStmt = db.prepare('DELETE FROM play_events WHERE played_at < ?');
  const capEventsStmt = db.prepare(`DELETE FROM play_events WHERE user_id = ? AND id NOT IN (
    SELECT id FROM play_events WHERE user_id = ? ORDER BY played_at DESC LIMIT ?)`);
  // client errors — dedup by signature
  const upsertErrStmt = db.prepare(`INSERT INTO client_errors
    (signature, user_id, message, stack, route, user_agent, app_version, count, first_seen, last_seen)
    VALUES (@sig, @uid, @msg, @stk, @route, @ua, @ver, 1, @now, @now)
    ON CONFLICT(signature) DO UPDATE SET count = count + 1, last_seen = @now, user_id = @uid`);
  const capErrorsStmt = db.prepare(`DELETE FROM client_errors WHERE signature NOT IN (
    SELECT signature FROM client_errors ORDER BY last_seen DESC LIMIT ?)`);
  const listErrStmt = db.prepare('SELECT * FROM client_errors ORDER BY count DESC, last_seen DESC LIMIT ?');

  const backend = {
    name: 'sqlite',
    db,
    load(userId) {
      try {
        const row = getStmt.get(userId);
        return row ? JSON.parse(row.doc) : null;
      } catch (e) {
        console.error('store.load(sqlite) error:', e.message);
        return null;
      }
    },
    save(userId, data) {
      try {
        upsertStmt.run({ id: userId, doc: JSON.stringify(data), ts: Date.now() });
      } catch (e) {
        console.error('store.save(sqlite) error:', e.message);
      }
    },
    all(cb) {
      try {
        for (const row of allStmt.iterate()) {
          try { cb(row.user_id, JSON.parse(row.doc)) } catch { /* skip corrupt row */ }
        }
      } catch (e) {
        console.error('store.all(sqlite) error:', e.message);
      }
    },
    _getTs(userId) {
      const row = getTsStmt.get(userId);
      return row ? row.ts : null;
    },
    // ─── batch-4 accessors (retention swept on write) ───
    createShare({ code, payload, ownerId, ownerName }) {
      const now = Date.now();
      sweepSharesStmt.run(now);
      insShareStmt.run({ code, payload, ownerId, ownerName, now, exp: now + SHARE_TTL_MS });
    },
    getShare(code) {
      const row = getShareStmt.get(code);
      if (!row || row.expires_at < Date.now()) return null;
      return row;
    },
    deleteShare(code, ownerId) {
      return delShareStmt.run(code, ownerId).changes > 0;
    },
    addPlayEvent({ userId, songId, artistKey, sessionId, shared, buffered }) {
      insEventStmt.run({ uid: userId, sid: songId, akey: artistKey || null,
        ts: Date.now(), sess: sessionId || null, shared: shared ? 1 : 0, buf: buffered ? 1 : 0 });
      sweepEventsStmt.run(Date.now() - EVENT_TTL_MS);
      capEventsStmt.run(userId, userId, EVENT_CAP_PER_USER);
    },
    addClientError({ signature, userId, message, stack, route, userAgent, appVersion }) {
      upsertErrStmt.run({ sig: signature, uid: userId || null, msg: message, stk: stack,
        route: route || null, ua: userAgent || null, ver: appVersion || null, now: Date.now() });
      capErrorsStmt.run(ERROR_ROW_CAP);
    },
    listClientErrors(limit = 50) {
      return listErrStmt.all(limit);
    }
  };

  // Migration — synchronous, called before app.listen. Per file:
  // row absent → insert; file mtime newer than row ts → update (a
  // fallback-mode write during a native outage outranks the stale row).
  // Either way the file moves to migrated/; corrupt → migrated/failed/.
  try {
    let files;
    try { files = fs.readdirSync(USER_DATA_DIR).filter(f => f.endsWith('.json')) } catch { files = [] }
    if (files.length) {
      fs.mkdirSync(MIGRATED_DIR, { recursive: true });
      fs.mkdirSync(FAILED_DIR, { recursive: true });
      for (const f of files) {
        const src = jsonFileFor(USER_DATA_DIR, f.replace(/\.json$/, '') + '.json');
        const srcPath = path.join(USER_DATA_DIR, f);
        const uid = f.replace(/\.json$/, '');
        let doc;
        try {
          doc = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        } catch {
          console.warn(`store: corrupt user file ${f} — moved to migrated/failed/`);
          try { fs.renameSync(srcPath, path.join(FAILED_DIR, f)) } catch {}
          continue;
        }
        const fileTs = (() => { try { return Math.round(fs.statSync(srcPath).mtimeMs) } catch { return Date.now() } })();
        const existingTs = backend._getTs(uid);
        if (existingTs === null || fileTs > existingTs) {
          upsertStmt.run({ id: uid, doc: JSON.stringify(doc), ts: fileTs });
        }
        try { fs.renameSync(srcPath, path.join(MIGRATED_DIR, f)) } catch {}
      }
      console.log(`store: migrated ${files.length} user doc(s) to sqlite`);
    }
  } catch (e) {
    console.error('store migration error:', e.message);
  }
  return backend;
}

// ─── Postgres backend (DATABASE_URL set — e.g. Supabase) ────────────────────
// Sync API preserved: all tables hydrate into memory at init(); reads serve
// memory; writes write-through on a serialized queue with dirty-retry that
// re-snapshots current state (never replays a stale value → LWW preserved).
// Hard precondition: ONE live instance per DATABASE_URL — two memory views
// diverge. If init fails, the backend delegates to sqlite (restoring the
// app.db.imported snapshot first when present) so members never see an
// empty store over a renamed database.
const IMPORTED_DB_PATH = DB_PATH + '.imported';
const PG_BOOT_BUDGET_MS = +(process.env.PG_BOOT_BUDGET_MS || 60000);

function makePgBackend() {
  const postgres = require('postgres'); // throws if package absent → module catch
  const users = new Map();    // userId -> { doc, ts }
  const shares = new Map();   // code -> { payload, owner_id, owner_name, created_at, expires_at }
  const errors = new Map();   // signature -> row
  const pendingEvents = [];   // failed inserts awaiting retry
  const dirty = { users: new Set(), shares: new Set(), errors: new Set() };
  const PENDING_EVENT_CAP = 5000;
  const SHARE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const EVENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
  const EVENT_CAP_PER_USER = 2000;
  const ERROR_ROW_CAP = 1000;

  let sql = null;
  let delegate = null;   // set on init failure — all sync methods delegate
  let chain = Promise.resolve();

  function enqueue(job, onFail) {
    const p = chain.then(job).catch(e => {
      console.error('pg write dirty:', e.message);
      onFail?.();
      return false;
    });
    chain = p.then(() => {});
    return p;
  }
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Retry tick — every 15s re-enqueue writes of CURRENT memory state.
  // The job reads state at run time so a newer write landing mid-queue
  // is never clobbered by the retry.
  setInterval(() => {
    if (delegate || !sql) return;
    for (const uid of [...dirty.users]) {
      dirty.users.delete(uid);
      enqueue(() => {
        const e = users.get(uid);
        return e ? sql`INSERT INTO users (user_id, doc, ts) VALUES (${uid}, ${JSON.stringify(e.doc)}, ${e.ts})
          ON CONFLICT (user_id) DO UPDATE SET doc = ${JSON.stringify(e.doc)}, ts = ${e.ts}` : null;
      }, () => dirty.users.add(uid));
    }
    for (const code of [...dirty.shares]) {
      dirty.shares.delete(code);
      enqueue(() => {
        const s = shares.get(code);
        return s
          ? sql`INSERT INTO shares (code, payload, owner_id, owner_name, created_at, expires_at)
              VALUES (${code}, ${s.payload}, ${s.owner_id}, ${s.owner_name}, ${s.created_at}, ${s.expires_at})
              ON CONFLICT (code) DO UPDATE SET payload = ${s.payload}, owner_id = ${s.owner_id},
                owner_name = ${s.owner_name}, created_at = ${s.created_at}, expires_at = ${s.expires_at}`
          : sql`DELETE FROM shares WHERE code = ${code}`;
      }, () => dirty.shares.add(code));
    }
    for (const sig of [...dirty.errors]) {
      dirty.errors.delete(sig);
      enqueue(() => {
        const r = errors.get(sig);
        return r ? upsertErrorSql(r) : null;
      }, () => dirty.errors.add(sig));
    }
    while (pendingEvents.length) {
      const batch = pendingEvents.splice(0, 200);
      // sql(objArray) emits the column list + VALUES itself — no manual cols
      enqueue(() => sql`INSERT INTO play_events ${sql(batch.map(e => ({
          user_id: e.userId, song_id: e.songId, artist_key: e.artistKey || null,
          played_at: e.ts, session_id: e.sessionId || null,
          shared: e.shared ? 1 : 0, buffered: e.buffered ? 1 : 0 })))}`,
        () => { pendingEvents.unshift(...batch.slice(0, Math.max(0, PENDING_EVENT_CAP - pendingEvents.length))) });
    }
  }, 15000).unref();

  function upsertErrorSql(r) {
    return sql`INSERT INTO client_errors
      (signature, user_id, message, stack, route, user_agent, app_version, count, first_seen, last_seen)
      VALUES (${r.signature}, ${r.user_id}, ${r.message}, ${r.stack}, ${r.route},
              ${r.user_agent}, ${r.app_version}, ${r.count}, ${r.first_seen}, ${r.last_seen})
      ON CONFLICT (signature) DO UPDATE SET count = client_errors.count + 1, last_seen = ${r.last_seen}, user_id = ${r.user_id}`;
  }

  async function reconcileSqlite() {
    if (!fs.existsSync(DB_PATH)) return;
    const Database = require('better-sqlite3');
    const sdb = new Database(DB_PATH);
    try {
      const pgTs = new Map((await sql`SELECT user_id, ts FROM users`).map(r => [r.user_id, Number(r.ts)]));
      const sUsers = sdb.prepare('SELECT user_id, doc, ts FROM users').all();
      const sShares = sdb.prepare('SELECT * FROM shares').all();
      const sEvents = sdb.prepare('SELECT * FROM play_events').all();
      const sErrors = sdb.prepare('SELECT * FROM client_errors').all();
      await sql.begin(async tx => {
        for (const r of sUsers) {
          // Per-row newest-ts merge — heals writes made during a fallback window
          if (r.ts > (pgTs.get(r.user_id) || 0)) {
            await tx`INSERT INTO users (user_id, doc, ts) VALUES (${r.user_id}, ${r.doc}, ${r.ts})
              ON CONFLICT (user_id) DO UPDATE SET doc = ${r.doc}, ts = ${r.ts}`;
          }
        }
        for (const s of sShares) {
          await tx`INSERT INTO shares (code, payload, owner_id, owner_name, created_at, expires_at)
            VALUES (${s.code}, ${s.payload}, ${s.owner_id}, ${s.owner_name}, ${s.created_at}, ${s.expires_at})
            ON CONFLICT (code) DO NOTHING`;
        }
        for (let i = 0; i < sEvents.length; i += 500) {
          const chunk = sEvents.slice(i, i + 500);
          await tx`INSERT INTO play_events ${tx(chunk)} ON CONFLICT (id) DO NOTHING`;
        }
        for (const r of sErrors) {
          await tx`INSERT INTO client_errors
            (signature, user_id, message, stack, route, user_agent, app_version, count, first_seen, last_seen)
            VALUES (${r.signature}, ${r.user_id}, ${r.message}, ${r.stack}, ${r.route},
                    ${r.user_agent}, ${r.app_version}, ${r.count}, ${r.first_seen}, ${r.last_seen})
            ON CONFLICT (signature) DO UPDATE SET
              count = client_errors.count + EXCLUDED.count,
              last_seen = GREATEST(client_errors.last_seen, EXCLUDED.last_seen),
              first_seen = LEAST(client_errors.first_seen, EXCLUDED.first_seen)`;
        }
      });
      sdb.pragma('wal_checkpoint(TRUNCATE)'); // WAL is not a snapshot
    } finally {
      sdb.close();
    }
    // Only rename after the transaction committed — a failed import leaves
    // app.db untouched so the next boot (or fallback) still sees the data.
    fs.renameSync(DB_PATH, IMPORTED_DB_PATH);
    for (const suf of ['-wal', '-shm']) {
      try { if (fs.existsSync(DB_PATH + suf)) fs.renameSync(DB_PATH + suf, IMPORTED_DB_PATH + suf) } catch {}
    }
    console.log('store: sqlite → postgres reconcile complete, snapshot at app.db.imported');
  }

  const api = {
    name: 'pg',
    async init() {
      const url = process.env.DATABASE_URL;
      const host = (() => { try { return new URL(url).host } catch { return '(bad URL)' } })();
      try {
        // Session-mode pooler (port 5432): IPv4 + prepared statements.
        // Direct db.*.supabase.co is IPv6-only (Render can't reach it);
        // the 6543 transaction pooler rejects prepared statements.
        // SSL required by default (Supabase). sslmode=disable in the URL
        // overrides — for local docker/dev Postgres only.
        const ssl = /sslmode=disable/.test(url) ? false : 'require';
        sql = postgres(url, { ssl, connect_timeout: 5, prepare: true, max: 3, onnotice: () => {} });
        const deadline = Date.now() + PG_BOOT_BUDGET_MS;
        let connected = false, lastErr;
        while (!connected && Date.now() < deadline) {
          try { await sql`SELECT 1`; connected = true }
          catch (e) { lastErr = e; await delay(4000) } // paused-project cold resume ~30s
        }
        if (!connected) throw lastErr || new Error('connect timeout budget exhausted');

        await sql`CREATE TABLE IF NOT EXISTS users (
          user_id TEXT PRIMARY KEY, doc TEXT NOT NULL, ts BIGINT NOT NULL)`;
        await sql`CREATE TABLE IF NOT EXISTS shares (
          code TEXT PRIMARY KEY, payload TEXT NOT NULL, owner_id TEXT NOT NULL,
          owner_name TEXT, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL)`;
        await sql`CREATE TABLE IF NOT EXISTS play_events (
          id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          user_id TEXT NOT NULL, song_id TEXT NOT NULL, artist_key TEXT,
          played_at BIGINT NOT NULL, session_id TEXT,
          shared INTEGER NOT NULL DEFAULT 1, buffered INTEGER NOT NULL DEFAULT 0)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_events_user_time ON play_events(user_id, played_at)`;
        await sql`CREATE TABLE IF NOT EXISTS client_errors (
          signature TEXT PRIMARY KEY, user_id TEXT, message TEXT, stack TEXT,
          route TEXT, user_agent TEXT, app_version TEXT,
          count INTEGER NOT NULL DEFAULT 1, first_seen BIGINT NOT NULL, last_seen BIGINT NOT NULL)`;

        await reconcileSqlite();

        const [uRows, sRows, eRows] = await Promise.all([
          sql`SELECT user_id, doc, ts FROM users`,
          sql`SELECT * FROM shares`,
          sql`SELECT * FROM client_errors`,
        ]);
        for (const r of uRows) {
          try { users.set(r.user_id, { doc: JSON.parse(r.doc), ts: Number(r.ts) }) } catch {}
        }
        for (const r of sRows) shares.set(r.code, {
          payload: r.payload, owner_id: r.owner_id, owner_name: r.owner_name,
          created_at: Number(r.created_at), expires_at: Number(r.expires_at)
        });
        for (const r of eRows) errors.set(r.signature, {
          signature: r.signature, user_id: r.user_id, message: r.message, stack: r.stack,
          route: r.route, user_agent: r.user_agent, app_version: r.app_version,
          count: Number(r.count), first_seen: Number(r.first_seen), last_seen: Number(r.last_seen)
        });
        console.log(`store: pg backend (${host}) — ${users.size} member doc(s)`);
      } catch (e) {
        console.error(`pg backend init failed (${host}):`, e.message);
        try { await sql?.end({ timeout: 1 }) } catch {}
        sql = null;
        // Restore the checkpointed snapshot so fallback never serves an
        // empty store over a renamed database. Skip if app.db already
        // exists (a previous fallback window may hold newer writes —
        // reconcileSqlite will merge them back on the next good pg boot).
        try {
          if (!fs.existsSync(DB_PATH) && fs.existsSync(IMPORTED_DB_PATH)) {
            fs.copyFileSync(IMPORTED_DB_PATH, DB_PATH);
          }
        } catch {}
        try { delegate = makeSqliteBackend() } catch { delegate = jsonBackend }
        api.name = delegate.name;
      }
    },
    load(userId) {
      if (delegate) return delegate.load(userId);
      const e = users.get(userId);
      return e ? structuredClone(e.doc) : null; // snapshot semantics like sqlite
    },
    save(userId, data) {
      if (delegate) return delegate.save(userId, data);
      const entry = { doc: structuredClone(data), ts: Date.now() };
      users.set(userId, entry);
      enqueue(() => {
        const e = users.get(userId); // current state at run time
        return e ? sql`INSERT INTO users (user_id, doc, ts) VALUES (${userId}, ${JSON.stringify(e.doc)}, ${e.ts})
          ON CONFLICT (user_id) DO UPDATE SET doc = ${JSON.stringify(e.doc)}, ts = ${e.ts}` : null;
      }, () => dirty.users.add(userId));
    },
    all(cb) {
      if (delegate) return delegate.all(cb);
      for (const [uid, e] of users) {
        try { cb(uid, structuredClone(e.doc)) } catch { /* skip corrupt */ }
      }
    },
    _getTs(userId) {
      if (delegate) return delegate._getTs?.(userId) ?? null;
      return users.get(userId)?.ts ?? null;
    },
    // Shares return the settlement promise — routes await it so a copied
    // link can never 404 inside the write-through window.
    createShare({ code, payload, ownerId, ownerName }) {
      if (delegate) return Promise.resolve(delegate.createShare({ code, payload, ownerId, ownerName }));
      const now = Date.now();
      for (const [c, s] of shares) {
        if (s.expires_at < now) { shares.delete(c); dirty.shares.add(c); }
      }
      enqueue(() => sql`DELETE FROM shares WHERE expires_at < ${now}`);
      shares.set(code, { payload, owner_id: ownerId, owner_name: ownerName, created_at: now, expires_at: now + SHARE_TTL_MS });
      return enqueue(() => {
        const s = shares.get(code);
        return s ? sql`INSERT INTO shares (code, payload, owner_id, owner_name, created_at, expires_at)
          VALUES (${code}, ${s.payload}, ${s.owner_id}, ${s.owner_name}, ${s.created_at}, ${s.expires_at})
          ON CONFLICT (code) DO UPDATE SET payload = ${s.payload}, owner_id = ${s.owner_id},
            owner_name = ${s.owner_name}, created_at = ${s.created_at}, expires_at = ${s.expires_at}` : null;
      }, () => dirty.shares.add(code));
    },
    getShare(code) {
      if (delegate) return delegate.getShare(code);
      const s = shares.get(code);
      if (!s || s.expires_at < Date.now()) return null;
      return { payload: s.payload, owner_name: s.owner_name, expires_at: s.expires_at };
    },
    deleteShare(code, ownerId) {
      if (delegate) return Promise.resolve(delegate.deleteShare(code, ownerId));
      const s = shares.get(code);
      if (!s || s.owner_id !== ownerId) return Promise.resolve(false);
      shares.delete(code);
      return enqueue(() => sql`DELETE FROM shares WHERE code = ${code} AND owner_id = ${ownerId}`,
        () => dirty.shares.add(code)).then(() => true);
    },
    addPlayEvent({ userId, songId, artistKey, sessionId, shared, buffered }) {
      if (delegate) return delegate.addPlayEvent({ userId, songId, artistKey, sessionId, shared, buffered });
      const ev = { userId, songId, artistKey, sessionId, shared, buffered, ts: Date.now() };
      enqueue(() => sql`INSERT INTO play_events
          (user_id, song_id, artist_key, played_at, session_id, shared, buffered)
          VALUES (${ev.userId}, ${ev.songId}, ${ev.artistKey || null}, ${ev.ts},
                  ${ev.sessionId || null}, ${ev.shared ? 1 : 0}, ${ev.buffered ? 1 : 0})`,
        () => { if (pendingEvents.length < PENDING_EVENT_CAP) pendingEvents.push(ev); else console.error('pg write dropped: play_events cap') });
      // Retention runs pg-side — defined on the durable truth, not memory
      enqueue(() => sql`DELETE FROM play_events WHERE played_at < ${ev.ts - EVENT_TTL_MS}`);
      enqueue(() => sql`DELETE FROM play_events WHERE user_id = ${userId} AND id NOT IN (
        SELECT id FROM play_events WHERE user_id = ${userId} ORDER BY played_at DESC LIMIT ${EVENT_CAP_PER_USER})`);
    },
    addClientError({ signature, userId, message, stack, route, userAgent, appVersion }) {
      if (delegate) return delegate.addClientError({ signature, userId, message, stack, route, userAgent, appVersion });
      const now = Date.now();
      const cur = errors.get(signature);
      const row = cur
        ? { ...cur, count: cur.count + 1, last_seen: now, user_id: userId || cur.user_id }
        : { signature, user_id: userId || null, message, stack, route: route || null,
            user_agent: userAgent || null, app_version: appVersion || null, count: 1, first_seen: now, last_seen: now };
      errors.set(signature, row);
      if (errors.size > ERROR_ROW_CAP) {
        const oldest = [...errors.values()].sort((a, b) => a.last_seen - b.last_seen)[0];
        errors.delete(oldest.signature); dirty.errors.add(oldest.signature); // retry deletes it (absent from memory)
      }
      enqueue(() => upsertErrorSql(row), () => dirty.errors.add(signature));
      enqueue(() => sql`DELETE FROM client_errors WHERE signature NOT IN (
        SELECT signature FROM client_errors ORDER BY last_seen DESC LIMIT ${ERROR_ROW_CAP})`);
    },
    listClientErrors(limit = 50) {
      if (delegate) return delegate.listClientErrors(limit);
      return [...errors.values()]
        .sort((a, b) => b.count - a.count || b.last_seen - a.last_seen)
        .slice(0, limit);
    },
    // Bounded flush on shutdown — pending writes land if pg is reachable
    _drain: () => Promise.race([chain, delay(3000)]),
  };

  process.on('SIGTERM', () => {
    api._drain().finally(() => process.exit(0));
  });
  return api;
}

let store;
if (process.env.DATABASE_URL) {
  try {
    store = makePgBackend();
    console.log('store: postgres backend selected (hydrates at init)');
  } catch (e) {
    console.warn(`store: postgres driver unavailable (${e.message}) — falling back`);
    store = null;
  }
}
if (!store) {
  try {
    store = makeSqliteBackend();
    console.log(`store: sqlite backend (${DB_PATH})`);
  } catch (e) {
    console.warn(`store: better-sqlite3 unavailable (${e.message}) — falling back to JSON files`);
    store = jsonBackend;
  }
}
if (!store.init) store.init = () => Promise.resolve(); // uniform async boot

module.exports = store;
