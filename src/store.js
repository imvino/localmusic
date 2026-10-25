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

let store;
try {
  store = makeSqliteBackend();
  console.log(`store: sqlite backend (${DB_PATH})`);
} catch (e) {
  console.warn(`store: better-sqlite3 unavailable (${e.message}) — falling back to JSON files`);
  store = jsonBackend;
}

module.exports = store;
