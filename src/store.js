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
  }
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
  const getStmt = db.prepare('SELECT doc FROM users WHERE user_id = ?');
  const getTsStmt = db.prepare('SELECT ts FROM users WHERE user_id = ?');
  const upsertStmt = db.prepare(`INSERT INTO users (user_id, doc, ts)
    VALUES (@id, @doc, @ts)
    ON CONFLICT(user_id) DO UPDATE SET doc = @doc, ts = @ts`);
  const allStmt = db.prepare('SELECT user_id, doc FROM users');

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
