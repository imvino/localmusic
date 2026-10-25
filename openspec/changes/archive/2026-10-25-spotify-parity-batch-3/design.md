# Design — spotify-parity-batch-3

## D1: SQLite behind the existing storage contract

`loadUserData(userId)` / `saveUserData(userId, doc)` keep their signatures —
callers: `GET /api/me/library`, `PUT /api/me/library`, `/api/family/activity`
(the latter also gets `store.all(cb)` instead of its direct `readdirSync`).

- Schema: `users(user_id TEXT PRIMARY KEY, doc TEXT NOT NULL, ts INTEGER)`.
  Whole-doc JSON in a column — merge logic stays in JS where it's tested.
- Migration runs synchronously at startup BEFORE `app.listen` — no request
  can interleave mid-migration. For each `data/users/*.json`: if the row is
  absent → INSERT; if the row exists but the file mtime is newer than the
  row's `ts` (a fallback-mode write during a native outage) → UPDATE. Either
  way the file moves to `data/users/migrated/` so nothing legacy lingers;
  unparseable files go to `data/users/migrated/failed/` (logged once, never
  re-warned, never deleted).
- Fallback backend (better-sqlite3 fails to `require`): same JSON-file impl
  but scans `data/users/` **and `data/users/migrated/`** (newest mtime wins)
  — a post-migration native failure must not hide migrated users. This also
  makes rollback automatic: kill the DB file, restart, migrated files serve.
- Honest framing: today's PUT path is synchronous end-to-end — no lost-update
  race exists to fix. SQLite buys **crash atomicity** (no torn JSON) and
  kills the per-request full-directory parse in `/api/family/activity`.

## D2: Presence — per-connection entries + heartbeat

```
server:  WebSocketServer({server, path:'/ws/presence'})
         connId = random; presence map keyed `${userId}#${connId}`
         → entry {userId, name, song, ts}; conn.userId set after auth
         first msg must be {type:'auth',token} → clerkClient.verifyToken
         on 'now'/'idle' → sender doc.shareActivity gate → update entry
         broadcast {type:'presence', members} deduped by userId (newest ts)
         server-side throttle: reject 'now' <5s after last accepted 'now'
           UNLESS the song id differs (a fast skip must update immediately)
         entry ts stamped server-side (Date.now() at receipt — client
           clocks are never trusted for sweep/dedupe)
         broadcast only when the serialized deduped view changed —
           heartbeats that change nothing send nothing
         sweep 30s: drop entries idle >90s → broadcast if changed
         conn close → delete THAT conn entry → broadcast if it changed view
client:  usePresence()
         skipped entirely when no Clerk key (AuthGate's HAS_CLERK check —
           Clerk-free dev forces isSignedIn=true with a null token)
         connects when isSignedIn && shareActivity && !privateSession
         getToken() re-fetched on EVERY (re)connect — tokens rotate
         socket closed on sign-out
         sends 'now' on song start + heartbeat 'now' every 45s while playing
         'idle' on stop, pause>60s, privateSession-on, shareActivity-off,
           beforeunload
         reconnect backoff 1s→30s, re-announce current song on reconnect
```

- **P0 fix — heartbeat:** `now` on song-start alone dies at the 90s sweep.
  A 45s heartbeat while `isPlaying` keeps the entry fresh; sweep stays 90s.
- **Per-connection keys:** a member's second tab/device can't evict their
  first; close/idle removes only that connection's entry. Broadcast dedupes
  by userId → one row per member.
- **Private session gate:** the client sends `idle` + stops heartbeats when
  private session is on — mirrors the "record nothing" contract. Presence
  must not leak what private session hides.
- **shareActivity stays server-enforced** via the sender's stored doc.
- Presence is runtime-only; restarts empty it, clients re-announce.

## D3: Chromecast via CAF default receiver + session controller

Lazy-load `cast_sender.js?loadCastFramework=1`, init on demand. The default
media receiver `loadMedia`s a direct audio URL — no custom receiver.

**Cast URL resolution:**
0. `const base = API_BASE || window.location.origin` — `VITE_API_URL` is
   unset in default dev (streams go through the Vite proxy), so step 0
   covers dev + phone-on-LAN (`vite host:true`) before the ladder.
1. base hostname public or private-IPv4 → use as-is.
2. base localhost → `GET /api/lan` → `{origin:"http://<lan-ipv4>:3001"}`
   → `${origin}/api/stream/${id}?bitrate=160`.
3. No resolvable origin → **button hidden**.

**`/api/lan` is dev-only:** `requireUser` + `rateLimited` + returns origin
only when `req.headers.host` is localhost/127.0.0.1/private-IPv4 — on a
public deployment it returns `{origin:null}` (container IPs are
LAN-unreachable garbage; don't leak them).

**Session controller (the grill's point — cast isn't a one-song feature):**
while the app is open and casting, a light `getMediaSession()` poll watches
`idleReason` (backgrounded tabs throttle timers — FINISHED detection lags
when the phone screen is off; documented v1 limit, not a bug); on `FINISHED`
→ `recordPlayStats` for the finished song
(threshold rules hold — cast plays count), advance queue pointer, `loadMedia`
the next queued song. `isLocal` songs CAN cast — `/api/stream` serves them
when MUSIC_DIR is mounted; the URL is identical.

On connect: pause local element, `loadMedia` at `currentTime`. On
disconnect: `session.stop()`, local stays paused, queue intact.

## D4: Loudness normalization — per-element registry + lazy graph

**The grill caught it: eq.js has NO per-element registry** — single `source`
+ `attachedElement` variables, each `ensureGraph` overwrites them. D4 is a
real rewrite into `Map<element, {source, normGain, analyser}>`:

```
source_el ──→ normGain_el ──→ [shared eq chain] ──→ destination
     └──→ analyser_el (tap, feeds RMS loop)
```

- `ensureGraph(el)` is the ONLY way an element enters the Map, called:
  (a) lazily at the first play gesture when `eqEnabled || normalizeVolume`,
  and (b) in `startCrossfade` for the incoming element BEFORE `inEl.play()`
  — normalize-ON/EQ-OFF must not strand a crossfaded session unnormalized.
  NEVER from the mount-time prefs effect for the normalize-only case: the
  existing `warmEq` eager-build is exactly the suspended-context trap
  (media-session/lock-screen resume is not a gesture, `ctx.resume()` rejects
  → captured element is silent). Every play path calls `ctx.resume()` while
  either feature is on.
- Measurement loop (per audible element, 500ms): `getFloatTimeDomainData` →
  mean-square → ~15s rolling RMS dBFS →
  `gainDb = clamp(-20 - rmsDb, -12, +12)` →
  `normGain.gain.setTargetAtTime(dbToLin(gainDb), t, 0.3)`.
  TARGET ≈ -20dBFS RMS — a pragmatic stand-in for -14 LUFS; documented
  approximation.
- **Fade freeze:** while `fadingRef` or `xfadeRef` covers an element, its
  measurement freezes — a ramping-down element must not get re-boosted to
  +12dB mid-crossfade (grill P1).
- Per-element `normGain` keeps fade independence; disable = set normGain to
  1 (never disconnect a captured `MediaElementSource` — that's silence).
- **ACAO fix:** only the `/api/stream` local-file branch needs
  `Access-Control-Allow-Origin: *` — `/music/` static serving already sits
  behind the global `cors` middleware. Without it `crossOrigin="anonymous"`
  capture outputs silence.
- WS hygiene: `maxPayload` ~64KB on the WebSocketServer — a crafted client
  shouldn't allocate 100MB garbage frames per connection.
- `localStorage` `normalizeVolume`, member-synced + `guestNormalizeVolume`
  device-local, default ON, in all batch-2 key enumerations.

## D5: Persisted vs runtime — the contradiction resolved

`normalizeVolume`/`guestNormalizeVolume` → synced + wiped like batch-2 keys.
**Cast availability is runtime discovery state — not persisted, not synced,
never in pushSnapshot/PERSONAL_KEYS** (the earlier spec draft said
otherwise; corrected).

## Verified facts (post-grill corrections applied)

- `loadUserData`/`saveUserData`: 3 call sites; family-activity reads the dir
  directly — ported to `store.all`.
- eq.js: single `source`/`attachedElement`, no registry — D4 rewrites it.
- All `ctx.resume()`/enableEq call sites are EQ-gated today — D4 adds the
  normalize-conditional resume.
- Local stream responses lack ACAO (proxied streams have it) — D4 adds it.
- `ws`, `better-sqlite3` not installed. Node v20.17 → better-sqlite3 v11+
  prebuilds needed; fallback covers failure.
- `recordPlayStats` thresholds: 30s/50% rule — cast FINISHED path reuses it.
